import { useEffect, useRef, type ReactNode } from "react";

/**
 * An error shown right next to what caused it. It scrolls itself into view when it appears or changes, so it is never
 * hidden below the fold of a long form or sheet.
 */
export default function FormError({ children, id }: { children: ReactNode; id?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [children]);
  return <p ref={ref} id={id} className="error form-error" role="alert">{children}</p>;
}
