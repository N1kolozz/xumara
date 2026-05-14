import { Plus, LogIn, Users, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalType } from "@/types/game";
import s from "./Home.module.css";

interface ActionCardsProps {
  openModal: (type: ModalType) => void;
}

const ActionCards = ({ openModal }: ActionCardsProps) => {
  return (
    <section className={s.homeActions}>
      <button
        type="button"
        className={cn(s.homeCard, s.homeCardCreate)}
        onClick={() => openModal("create")}
        id="btn-create-room"
      >
        <div className={cn(s.homeCardGlow, s.homeCardGlowCreate)} />
        <div className={cn(s.homeCardBadge, s.homeCardBadgeCreate)}>
          <Plus className="h-3.5 w-3.5" />
          <span>ახალი</span>
        </div>
        <div className={cn(s.homeCardIconWrap, s.homeCardIconCreate)}>
          <Users className="h-8 w-8" />
        </div>
        <h2 className={s.homeCardTitle}>შექმენი<br />ოთახი</h2>
        <p className={s.homeCardDesc}>მოიწვიე მეგობრები<br />PIN-ით</p>
      </button>

      <button
        type="button"
        className={cn(s.homeCard, s.homeCardJoin)}
        onClick={() => openModal("join")}
        id="btn-join-room"
      >
        <div className={cn(s.homeCardGlow, s.homeCardGlowJoin)} />
        <div className={cn(s.homeCardBadge, s.homeCardBadgeJoin)}>
          <LogIn className="h-3.5 w-3.5" />
        </div>
        <div className={cn(s.homeCardIconWrap, s.homeCardIconJoin)}>
          <Gamepad2 className="h-8 w-8" />
        </div>
        <h2 className={s.homeCardTitle}>შეუერთდი<br />ოთახს</h2>
        <p className={s.homeCardDesc}>შეიყვანე PIN და<br />არჩიე როლი</p>
      </button>
    </section>
  );
};

export default ActionCards;
