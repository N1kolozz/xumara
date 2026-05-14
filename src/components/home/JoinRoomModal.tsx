import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Role } from "@/types/game";
import { RoleSelector } from "./RoleSelector";
import s from "./Home.module.css";

interface JoinRoomModalProps {
  isJoining: boolean;
  onJoin: (name: string, pin: string, role: Role | null) => void;
  showRoleError: boolean;
  setShowRoleError: (show: boolean) => void;
}

export const JoinRoomModal = ({ isJoining, onJoin, showRoleError, setShowRoleError }: JoinRoomModalProps) => {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  return (
    <>
      <div className={s.homeField}>
        <label className={s.homeFieldLabel} htmlFor="modal-join-name">
          სახელი
        </label>
        <Input
          id="modal-join-name"
          placeholder="შენი სახელი"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className={s.homeInput}
        />
      </div>

      <div className={s.homeField}>
        <label className={s.homeFieldLabel} htmlFor="modal-join-pin">
          PIN
        </label>
        <Input
          id="modal-join-pin"
          placeholder="ოთახის PIN"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.toUpperCase());
            setShowRoleError(false);
          }}
          className={cn(s.homeInput, s.homeInputPin)}
          maxLength={6}
        />
      </div>

      <RoleSelector
        role={role}
        setRole={(newRole) => {
          setRole(newRole);
          setShowRoleError(false);
        }}
        tone="accent"
        error={showRoleError}
      />

      <button
        type="button"
        onClick={() => onJoin(name, pin, role)}
        disabled={isJoining}
        className={cn(s.homeSubmitBtn, s.homeSubmitBtnJoin)}
      >
        {isJoining ? (
          <span className={s.homeSpinner} />
        ) : (
          <>
            შეუერთდი თამაშს
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </button>
    </>
  );
};
