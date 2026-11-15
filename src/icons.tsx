import type { ReactNode } from "react";

// Every icon carries "ico ico-<name>" so fluid.css can animate it when its button is hovered, focused or pressed.
// Those animations are static for anyone who prefers reduced motion (or turns Reduce motion on in Settings).
const Svg = ({ children, filled = false, n = "" }: { children: ReactNode; filled?: boolean; n?: string }) => (
  <svg className={`ico ico-${n}`} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const CopyIcon = () => <Svg n="copy"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>;
export const EditIcon = () => <Svg n="edit"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>;
export const CoffeeIcon = () => <Svg n="coffee"><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3v2M12 3v2" /></Svg>;
export const PlayIcon = () => <Svg n="play" filled><path d="M7 4.5v15l12-7.5z" /></Svg>;
export const TrashIcon = () => <Svg n="trash"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></Svg>;
export const CloseIcon = () => <Svg n="close"><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const MoonIcon = () => <Svg n="moon"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>;
export const SunIcon = () => <Svg n="sun"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const CameraIcon = () => <Svg n="camera"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
export const ImageIcon = () => <Svg n="image"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></Svg>;
export const LockIcon = () => <Svg n="lock"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const UsersIcon = () => <Svg n="users"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c1.8.8 3 2.6 3 5.6" /></Svg>;
export const GlobeIcon = () => <Svg n="globe"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" /></Svg>;
export const BookIcon = () => <Svg n="book"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></Svg>;
export const FeedIcon = () => <Svg n="feed"><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="13" width="16" height="7" rx="2" /></Svg>;
export const SearchIcon = () => <Svg n="search"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>;
export const CheckIcon = () => <Svg n="check"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const CommentIcon = () => <Svg n="comment"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Svg>;
export const SendIcon = () => <Svg n="send"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></Svg>;
export const GroupsIcon = () => <Svg n="groups"><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></Svg>;
export const MinusIcon = () => <Svg n="minus"><path d="M5 12h14" /></Svg>;
export const PlusIcon = () => <Svg n="plus"><path d="M12 5v14M5 12h14" /></Svg>;
export const EyeIcon = () => <Svg n="eye"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const EyeOffIcon = () => <Svg n="eye-off"><path d="M3 3l18 18" /><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.3 6.4C3.6 8.2 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>;
export const MailIcon = () => <Svg n="mail"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Svg>;
export const ThumbUpIcon = ({ filled = false }: { filled?: boolean }) => (
  <Svg n="thumb-up" filled={filled}><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /><path d="M19.5 1.5v4M17.5 3.5h4" /></Svg>
);
export const ThumbDownIcon = ({ filled = false }: { filled?: boolean }) => (
  <Svg n="thumb-down" filled={filled}><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9a2 2 0 0 0 2 2.3zM17 2h2.7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H17" /></Svg>
);
export const ShareIcon = () => <Svg n="share"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></Svg>;
export const ClockIcon = () => <Svg n="clock"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const MoreIcon = () => <Svg n="more"><circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" /></Svg>;
export const RotateIcon = () => <Svg n="rotate"><path d="M21 4v6h-6" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L21 10" /></Svg>;
export const FlipIcon = () => <Svg n="flip"><path d="M12 3v18" /><path d="M8 7l-5 5 5 5z" /><path d="M16 7l5 5-5 5z" /></Svg>;
export const SmileIcon = () => <Svg n="smile"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.4 2.2 4 2.2 4-2.2 4-2.2" /><path d="M9 9.5h.01M15 9.5h.01" /></Svg>;
export const ArrowLeftIcon = () => <Svg n="arrow-left"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></Svg>;
export const NoteIcon = () => <Svg n="note"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></Svg>;
export const RepostIcon = () => <Svg n="repost"><path d="M17 3l4 4-4 4" /><path d="M3 11V9a2 2 0 0 1 2-2h16" /><path d="M7 21l-4-4 4-4" /><path d="M21 13v2a2 2 0 0 1-2 2H3" /></Svg>;
export const SettingsIcon = () => <Svg n="settings"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>;
export const ChevronLeftIcon = () => <Svg n="chevron-left"><path d="M15 5l-7 7 7 7" /></Svg>;
export const ChevronRightIcon = () => <Svg n="chevron-right"><path d="M9 5l7 7-7 7" /></Svg>;
export const BellOffIcon = () => <Svg n="bell-off"><path d="M8.7 3.8A6 6 0 0 1 18 9c0 3 .6 4.8 1.3 6M6 9c0 6-2.5 7.5-2.5 7.5H15" /><path d="M10 20a2 2 0 0 0 4 0M3 3l18 18" /></Svg>;
export const UserIcon = () => <Svg n="user"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" /></Svg>;
export const BellIcon = () => <Svg n="bell"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></Svg>;
export const MonitorIcon = () => <Svg n="monitor"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>;
export const MenuIcon = () => <Svg n="menu"><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;

export const ArchiveIcon = () => <Svg n="archive"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></Svg>;
export const UnarchiveIcon = () => <Svg n="unarchive"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M12 17v-6M9.5 13.5L12 11l2.5 2.5" /></Svg>;
export const DownloadIcon = () => <Svg n="download"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19h14" /></Svg>;
export const MessagesIcon = () => <Svg n="messages"><path d="M4 5h16v11H9.5L4 20.5z" /></Svg>;
export const ChevronUpIcon = () => <Svg n="chevron-up"><path d="M5 15l7-7 7 7" /></Svg>;
export const ChevronDownIcon = () => <Svg n="chevron-down"><path d="M5 9l7 7 7-7" /></Svg>;
export const LogOutIcon = () => <Svg n="log-out"><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M16 8l4 4-4 4M20 12H9" /></Svg>;
export const CalendarIcon = () => <Svg n="calendar"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>;
export const ListIcon = () => <Svg n="list"><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></Svg>;
export const AlertIcon = () => <Svg n="alert"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></Svg>;
export const RestrictIcon = () => <Svg n="restrict"><path d="M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z" /><path d="M9 12h6" /></Svg>;
export const InfoIcon = () => <Svg n="info"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.5h.01" /></Svg>;
export const BlockIcon = () => <Svg n="block"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></Svg>;
export const ReceiptsIcon = () => <Svg n="receipts"><path d="M2 12.5l4.5 4.5L15 8.5" /><path d="M10 16.5l1 1L22 7" /></Svg>;
export const ReplyIcon = () => <Svg n="reply"><path d="M9 7L4 12l5 5" /><path d="M4 12h9a7 7 0 0 1 7 7v1" /></Svg>;
export const ForwardIcon = () => <Svg n="forward"><path d="M15 7l5 5-5 5" /><path d="M20 12h-9a7 7 0 0 0-7 7v1" /></Svg>;
export const PinIcon = () => <Svg n="pin"><path d="M9 4h6l-1 6 3 3H7l3-3z" /><path d="M12 13v7" /></Svg>;
export const FlagIcon = () => <Svg n="flag"><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></Svg>;
export const UndoIcon = () => <Svg n="undo"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Svg>;
