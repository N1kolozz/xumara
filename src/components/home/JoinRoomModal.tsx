import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Role } from "@/types/game";
import { RoleSelector } from "./RoleSelector";

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
      <div className="home-field">
        <label className="home-field-label" htmlFor="modal-join-name">
          სახელი
        </label>
        <Input
          id="modal-join-name"
          placeholder="შენი სახელი"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="home-input"
        />
      </div>

      <div className="home-field">
        <label className="home-field-label" htmlFor="modal-join-pin">
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
          className="home-input home-input-pin"
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
        className="home-submit-btn home-submit-btn-join"
      >
        {isJoining ? (
          <span className="home-spinner" />
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
