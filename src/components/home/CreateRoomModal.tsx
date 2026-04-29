import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Role } from "@/types/game";
import { RoleSelector } from "./RoleSelector";

interface CreateRoomModalProps {
  isCreating: boolean;
  onCreate: (name: string, role: Role | null) => void;
}

export const CreateRoomModal = ({ isCreating, onCreate }: CreateRoomModalProps) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  return (
    <>
      <div className="home-field">
        <label className="home-field-label" htmlFor="modal-create-name">
          სახელი
        </label>
        <Input
          id="modal-create-name"
          placeholder="შენი სახელი"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="home-input"
        />
      </div>

      <RoleSelector role={role} setRole={setRole} tone="primary" />

      <button
        type="button"
        onClick={() => onCreate(name, role)}
        disabled={isCreating}
        className="home-submit-btn home-submit-btn-create"
      >
        {isCreating ? (
          <span className="home-spinner" />
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
