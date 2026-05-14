import { Laugh, Gavel } from "lucide-react";
import { Role } from "@/types/game";
import { cn } from "@/lib/utils";
import s from "./Home.module.css";

interface RoleSelectorProps {
  role: Role | null;
  setRole: (role: Role) => void;
  tone: "primary" | "accent";
  error?: boolean;
}

export const RoleSelector = ({ role, setRole, tone, error }: RoleSelectorProps) => {
  const roleButtonClass = (active: boolean) =>
    cn(
      s.homeRoleBtn,
      active && (tone === "primary" ? s.homeRoleBtnActivePrimary : s.homeRoleBtnActiveAccent)
    );

  return (
    <div className={s.homeField}>
      <p className={s.homeFieldLabel}>როლი</p>
      <div className={s.homeRoleGrid}>
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
      {error && <p className={s.homeRoleError}>მსაჯული უკვე არსებობს</p>}
    </div>
  );
};
