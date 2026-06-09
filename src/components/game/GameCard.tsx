import { Inbox, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface GameCardProps {
  text: string;
  type: "inbox" | "reply";
  isSelected?: boolean;
  onClick?: () => void;
  onPointerDown?: () => void;
  size?: "normal" | "large";
  className?: string;
  style?: React.CSSProperties;
}

const GameCard = ({
  text,
  type,
  isSelected = false,
  onClick,
  onPointerDown,
  size = "normal",
  className,
  style,
}: GameCardProps) => {
  const isInbox = type === "inbox";

  const content = (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "icon-tile h-9 w-9 rounded-xl",
            isInbox
              ? "text-secondary"
              : "border-[#10241e]/15 bg-[#10241e]/10 text-[#10241e]",
          )}
        >
          {isInbox ? <Inbox className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        </div>
        <div
          className={cn(
            "card-label",
            isInbox
              ? "text-secondary"
              : "border-[#10241e]/20 bg-[#10241e]/10 text-[#10241e]",
          )}
        >
          {isInbox ? "INBOX" : "REPLY"}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <p
          className={cn(
            "text-balance text-center font-black leading-tight",
            size === "large" ? "text-xl sm:text-3xl" : "text-sm sm:text-base",
            isInbox ? "text-foreground" : "text-[#10241e]",
          )}
        >
          {text}
        </p>
      </div>
    </div>
  );

  const cardClassName = cn(
    "relative overflow-hidden rounded-xl border transition-all duration-300 animate-card-deal touch-manipulation",
    "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/25",
    size === "large"
      ? "w-full min-h-[168px] p-5 sm:min-h-[220px] sm:p-7"
      : "h-full min-h-[224px] w-full p-3 sm:min-h-[256px] sm:p-4",
    isInbox
      ? "border-secondary/25 bg-[linear-gradient(150deg,hsl(var(--surface-2)),hsl(var(--secondary)/0.20))] shadow-soft"
      : "border-primary/35 bg-[linear-gradient(160deg,hsl(48_42%_92%),hsl(var(--primary)/0.72))] shadow-[0_18px_42px_hsl(var(--primary)/0.16)]",
    isSelected &&
      "translate-y-[-4px] ring-2 ring-accent shadow-[0_0_0_1px_hsl(var(--accent)/0.22),0_24px_54px_hsl(var(--accent)/0.18)]",
    onClick &&
      "cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onPointerDown={onPointerDown}
        onClick={onClick}
        className={cardClassName}
        style={style}
        aria-pressed={isSelected}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cardClassName} style={style}>
      {content}
    </div>
  );
};

export default GameCard;
