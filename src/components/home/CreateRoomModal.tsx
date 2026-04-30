import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Role } from "@/types/game";
import { RoleSelector } from "./RoleSelector";
import styles from "./Home.module.css";

interface CreateRoomModalProps {
  isCreating: boolean;
  onCreate: (name: string, role: Role | null) => void;
}

export const CreateRoomModal = ({ isCreating, onCreate }: CreateRoomModalProps) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  return (
    <>
      <div className={styles["home-field"]}>
        <label className={styles["home-field-label"]} htmlFor="modal-create-name">
          სახელი
        </label>
        <Input
          id="modal-create-name"
          placeholder="შენი სახელი"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className={styles["home-input"]}
        />
      </div>

      <RoleSelector role={role} setRole={setRole} tone="primary" />

      <button
        type="button"
        onClick={() => onCreate(name, role)}
        disabled={isCreating}
        className={`${styles["home-submit-btn"]} ${styles["home-submit-btn-create"]}`}
      >
        {isCreating ? (
          <span className={styles["home-spinner"]} />
        ) : (
          <>
            ოთახის შექმნა
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </button>
    </>
  );
};
