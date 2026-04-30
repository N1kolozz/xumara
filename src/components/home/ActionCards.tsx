import { Plus, LogIn, Users, Gamepad2 } from "lucide-react";
import { ModalType } from "@/types/game";
import styles from "./Home.module.css";

interface ActionCardsProps {
  openModal: (type: ModalType) => void;
}

const ActionCards = ({ openModal }: ActionCardsProps) => {
  return (
    <section className={styles["home-actions"]}>
      {/* Create Room Card */}
      <button
        type="button"
        className={`${styles["home-card"]} ${styles["home-card-create"]}`}
        onClick={() => openModal("create")}
        id="btn-create-room"
      >
        <div className={`${styles["home-card-glow"]} ${styles["home-card-glow-create"]}`} />
        <div className={`${styles["home-card-badge"]} ${styles["home-card-badge-create"]}`}>
          <Plus className="h-3.5 w-3.5" />
          <span>ახალი</span>
        </div>
        <div className={`${styles["home-card-icon-wrap"]} ${styles["home-card-icon-create"]}`}>
          <Users className="h-8 w-8" />
        </div>
        <h2 className={styles["home-card-title"]}>შექმენი<br />ოთახი</h2>
        <p className={styles["home-card-desc"]}>მოიწვიე მეგობრები<br />PIN-ით</p>
      </button>

      {/* Join Room Card */}
      <button
        type="button"
        className={`${styles["home-card"]} ${styles["home-card-join"]}`}
        onClick={() => openModal("join")}
        id="btn-join-room"
      >
        <div className={`${styles["home-card-glow"]} ${styles["home-card-glow-join"]}`} />
        <div className={`${styles["home-card-badge"]} ${styles["home-card-badge-join"]}`}>
          <LogIn className="h-3.5 w-3.5" />
        </div>
        <div className={`${styles["home-card-icon-wrap"]} ${styles["home-card-icon-join"]}`}>
          <Gamepad2 className="h-8 w-8" />
        </div>
        <h2 className={styles["home-card-title"]}>შეუერთდი<br />ოთახს</h2>
        <p className={styles["home-card-desc"]}>შეიყვანე PIN და<br />არჩიე როლი</p>
      </button>
    </section>
  );
};

export default ActionCards;
