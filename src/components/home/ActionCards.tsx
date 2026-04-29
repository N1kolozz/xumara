import { Plus, LogIn, Users, Gamepad2 } from "lucide-react";
import { ModalType } from "@/types/game";

interface ActionCardsProps {
  openModal: (type: ModalType) => void;
}

const ActionCards = ({ openModal }: ActionCardsProps) => {
  return (
    <section className="home-actions">
      {/* Create Room Card */}
      <button
        type="button"
        className="home-card home-card-create"
        onClick={() => openModal("create")}
        id="btn-create-room"
      >
        <div className="home-card-glow home-card-glow-create" />
        <div className="home-card-badge home-card-badge-create">
          <Plus className="h-3.5 w-3.5" />
          <span>ახალი</span>
        </div>
        <div className="home-card-icon-wrap home-card-icon-create">
          <Users className="h-8 w-8" />
        </div>
        <h2 className="home-card-title">შექმენი<br />ოთახი</h2>
        <p className="home-card-desc">მოიწვიე მეგობრები<br />PIN-ით</p>
      </button>

      {/* Join Room Card */}
      <button
        type="button"
        className="home-card home-card-join"
        onClick={() => openModal("join")}
        id="btn-join-room"
      >
        <div className="home-card-glow home-card-glow-join" />
        <div className="home-card-badge home-card-badge-join">
          <LogIn className="h-3.5 w-3.5" />
        </div>
        <div className="home-card-icon-wrap home-card-icon-join">
          <Gamepad2 className="h-8 w-8" />
        </div>
        <h2 className="home-card-title">შეუერთდი<br />ოთახს</h2>
        <p className="home-card-desc">შეიყვანე PIN და<br />არჩიე როლი</p>
      </button>
    </section>
  );
};

export default ActionCards;
