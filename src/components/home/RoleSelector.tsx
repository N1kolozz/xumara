import { Laugh, Gavel } from "lucide-react";
import { Role } from "@/types/game";
import { cn } from "@/lib/utils";

interface RoleSelectorProps {
  role: Role | null;
  setRole: (role: Role) => void;
  tone: "primary" | "accent";
  error?: boolean;
}

export const RoleSelector = ({ role, setRole, tone, error }: RoleSelectorProps) => {
  const roleButtonClass = (active: boolean) =>
    cn(
      "home-role-btn",
      active && (tone === "primary" ? "home-role-btn-active-primary" : "home-role-btn-active-accent")
    );

  return (
    <div className="home-field">
      <p className="home-field-label">როლი</p>
      <div className="home-role-grid">
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
      {error && <p className="home-role-error">მსაჯული უკვე არსებობს</p>}
    </div>
  );
};
