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
  style
}: GameCardProps) => {
  const isInbox = type === "inbox";
  return <Card onClick={onClick} className={cn("relative overflow-hidden transition-all duration-300 animate-card-deal touch-manipulation active:scale-95", size === "large" ? "w-full max-w-xl p-4 sm:p-6 md:p-8" : "w-full h-full p-2 sm:p-3 md:p-4", isInbox ? "bg-gradient-to-br from-muted to-muted/50 border-muted-foreground/20" : "bg-gradient-to-br from-primary to-primary/80 border-primary/30", isSelected && "ring-2 sm:ring-4 ring-accent shadow-2xl", onClick && "cursor-pointer", className)} style={style}>
      <div className="flex flex-col h-full justify-between">
        <div className="flex-1 flex items-center justify-center">
          <p className={cn("text-center font-medium leading-tight", size === "large" ? "text-lg sm:text-2xl md:text-3xl" : "text-xs sm:text-sm md:text-base", isInbox ? "text-foreground" : "text-white")}>
            {text}
          </p>
        </div>

        <div className="flex items-center justify-between mt-1.5 sm:mt-2">
          <div className={cn("px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-bold uppercase", isInbox ? "bg-muted-foreground/10 text-muted-foreground" : "bg-white/20 text-white")}>
            {isInbox ? "INBOX" : "REPLY"}
          </div>

          {isInbox}
          {!isInbox && <div className="text-lg sm:text-2xl opacity-20">💬</div>}
        </div>
      </div>

      {/* Decorative corner elements */}
      <div className={cn("absolute top-0 right-0 opacity-10", size === "large" ? "w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20" : "w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12", isInbox ? "bg-muted-foreground" : "bg-white")} style={{
      clipPath: "polygon(100% 0, 0 0, 100% 100%)"
    }} />
    </Card>;
};
export default GameCard;