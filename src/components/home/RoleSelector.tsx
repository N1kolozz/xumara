import { Laugh, Gavel } from "lucide-react";
import { Role } from "@/types/game";
import { cn } from "@/lib/utils";
import styles from "./Home.module.css";

interface RoleSelectorProps {
  role: Role | null;
  setRole: (role: Role) => void;
  tone: "primary" | "accent";
  error?: boolean;
}

export const RoleSelector = ({ role, setRole, tone, error }: RoleSelectorProps) => {
  const roleButtonClass = (active: boolean) =>
    cn(
      styles["home-role-btn"],
      active && (tone === "primary" ? styles["home-role-btn-active-primary"] : styles["home-role-btn-active-accent"])
    );

  return (
    <div className={styles["home-field"]}>
      <p className={styles["home-field-label"]}>როლი</p>
      <div className={styles["home-role-grid"]}>
        <button
          type="button"
          aria-pressed={role === "player"}
          onClick={() => setRole("player")}
          className={roleButtonClass(role === "player")}
        >
          <Laugh className="h-5 w-5" />
          ხუმარა
        </button>
        <button
          type="button"
          aria-pressed={role === "judge"}
          onClick={() => setRole("judge")}
          className={roleButtonClass(role === "judge")}
        >
          <Gavel className="h-5 w-5" />
          მსაჯული
        </button>
      </div>
      {error && <p className={styles["home-role-error"]}>მსაჯული უკვე არსებობს</p>}
    </div>
  );
};
