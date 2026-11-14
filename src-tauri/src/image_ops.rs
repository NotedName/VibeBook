//! Photo work in Rust (RUST_PREP.md, phase 2, step 1). Replaces the canvas code in src/image.ts when VibeBook runs as the app.
//! The page sends the picture's raw bytes plus a few settings as headers; this sends back a JPEG as raw bytes.
//! Needs in Cargo.toml:  image = { version = "0.25.6", default-features = false, features = ["jpeg", "png", "webp"] }

use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ImageDecoder, ImageReader};
use std::io::Cursor;
use tauri::ipc::{InvokeBody, Request, Response};

/// Length of the data URL the page will build from `bytes` JPEG bytes ("data:image/jpeg;base64," + base64).
fn data_url_len(bytes: usize) -> usize {
    "data:image/jpeg;base64,".len() + bytes.div_ceil(3) * 4
}

/// Opens the picture and turns it the right way up using its camera orientation tag, like createImageBitmap's "from-image".
fn open(bytes: &[u8]) -> Result<DynamicImage, String> {
    let mut decoder = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .into_decoder()
        .map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    img.apply_orientation(orientation);
    Ok(img)
}

fn jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8(); // JPEG has no transparency
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, quality)
        .encode_image(&rgb)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// Lowers the quality in steps of 10 until the data URL fits, the same loop the canvas code uses.
fn fit(img: &DynamicImage, start: u8, floor: u8, max_chars: usize) -> Result<Vec<u8>, String> {
    let mut q = start;
    loop {
        let out = jpeg(img, q)?;
        if data_url_len(out.len()) <= max_chars { return Ok(out); }
        if q <= floor { return Err("too large to store".into()); }
        q = q.saturating_sub(10).max(floor);
    }
}

/// Headers: x-mode = photo | avatar | cover, x-size (longest side / square side / banner width),
/// x-quality (1 to 100), x-max-chars (the biggest data URL the page can store).
#[tauri::command]
pub async fn process_image(request: Request<'_>) -> Result<Response, String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("expected the raw picture bytes".into()) };
    let head = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_owned);
    let num = |name: &str| head(name).and_then(|v| v.parse::<u32>().ok()).ok_or_else(|| format!("missing {name}"));

    let mode = head("x-mode").ok_or("missing x-mode")?;
    let size = num("x-size")?;
    let quality = num("x-quality")?.clamp(1, 100) as u8;
    let max_chars = num("x-max-chars")? as usize;

    let img = open(bytes)?;
    let out = match mode.as_str() {
        // Shrink so the longest side is `size`; never enlarge.
        "photo" => {
            let longest = img.width().max(img.height());
            let img = if longest > size { img.resize(size, size, FilterType::Lanczos3) } else { img };
            fit(&img, quality, 40, max_chars)?
        }
        // Centre-crop to a square.
        "avatar" => fit(&img.resize_to_fill(size, size, FilterType::Lanczos3), quality, 40, max_chars)?,
        // Centre-crop to a 3:1 banner.
        "cover" => fit(&img.resize_to_fill(size, (size / 3).max(1), FilterType::Lanczos3), quality, 30, max_chars)?,
        other => return Err(format!("unknown x-mode {other}")),
    };
    Ok(Response::new(out))
}
