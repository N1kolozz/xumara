import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Role } from "@/types/game";
import { RoleSelector } from "./RoleSelector";
import s from "./Home.module.css";

interface CreateRoomModalProps {
  isCreating: boolean;
  onCreate: (name: string, role: Role | null) => void;
}

export const CreateRoomModal = ({ isCreating, onCreate }: CreateRoomModalProps) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  return (
    <>
      <div className={s.homeField}>
        <label className={s.homeFieldLabel} htmlFor="modal-create-name">
          სახელი
        </label>
        <Input
          id="modal-create-name"
          placeholder="შენი სახელი"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className={s.homeInput}
        />
      </div>

      <RoleSelector role={role} setRole={setRole} tone="primary" />

      <button
        type="button"
        onClick={() => onCreate(name, role)}
        disabled={isCreating}
        className={cn(s.homeSubmitBtn, s.homeSubmitBtnCreate)}
      >
        {isCreating ? (
          <span className={s.homeSpinner} />
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
