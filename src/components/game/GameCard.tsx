import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface GameCardProps {
  text: string;
  type: "inbox" | "reply";
  isSelected?: boolean;
  onClick?: () => void;
  size?: "normal" | "large";
  className?: string;
  style?: React.CSSProperties;
}

const GameCard = ({
  text,
  type,
  isSelected = false,
  onClick,
  size = "normal",
  className,
  style,
}: GameCardProps) => {
  const isInbox = type === "inbox";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative overflow-hidden transition-all duration-300 animate-card-deal",
        size === "large" ? "w-full max-w-xl p-8" : "p-6 aspect-[3/4]",
        isInbox
          ? "bg-gradient-to-br from-muted to-muted/50 border-muted-foreground/20"
          : "bg-gradient-to-br from-primary to-primary/80 border-primary/30",
        isSelected && "ring-4 ring-accent scale-105 shadow-2xl",
        onClick && "cursor-pointer hover:scale-105 hover:shadow-xl",
        "card-flip",
        className
      )}
      style={style}
    >
      <div className="flex flex-col h-full justify-between">
        <div className="flex-1 flex items-center justify-center">
          <p
            className={cn(
              "text-center font-medium leading-relaxed",
              size === "large" ? "text-2xl md:text-3xl" : "text-base md:text-lg",
              isInbox ? "text-foreground" : "text-white"
            )}
          >
            {text}
          </p>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold uppercase",
              isInbox
                ? "bg-muted-foreground/10 text-muted-foreground"
                : "bg-white/20 text-white"
            )}
          >
            {isInbox ? "INBOX" : "REPLY"}
          </div>

          {isInbox && (
            <div className="text-4xl opacity-20">📬</div>
          )}
          {!isInbox && (
            <div className="text-4xl opacity-20">💬</div>
          )}
        </div>
      </div>

      {/* Decorative corner elements */}
      <div
        className={cn(
          "absolute top-0 right-0 w-20 h-20 opacity-10",
          isInbox ? "bg-muted-foreground" : "bg-white"
        )}
        style={{
          clipPath: "polygon(100% 0, 0 0, 100% 100%)",
        }}
      />
    </Card>
  );
};

export default GameCard;
