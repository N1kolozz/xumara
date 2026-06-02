import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Gamepad2, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalType } from "@/types/game";
import { useRoomSetup } from "@/hooks/useRoomSetup";
import s from "@/components/home/Home.module.css";

import HomeHero from "@/components/home/HomeHero";
import ActionCards from "@/components/home/ActionCards";
import { CreateRoomModal } from "@/components/home/CreateRoomModal";
import { JoinRoomModal } from "@/components/home/JoinRoomModal";
import { InfoModal } from "@/components/home/InfoModal";

const Index = () => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [initialPin, setInitialPin] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    createRoom,
    joinRoom,
    isCreating,
    isJoining,
    showRoleError,
    setShowRoleError,
  } = useRoomSetup();

  // Deep link from a shared QR / link: /?pin=XXXX opens join pre-filled.
  useEffect(() => {
    const pinParam = searchParams.get("pin");
    if (pinParam) {
      setInitialPin(pinParam.toUpperCase());
      setActiveModal("join");
      searchParams.delete("pin");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeModal) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setModalVisible(true));
      });
    }
  }, [activeModal]);

  const closeModal = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setModalVisible(false);
    setTimeout(() => {
      setActiveModal(null);
      setShowRoleError(false);
    }, 320);
  };

  const openModal = (type: ModalType) => {
    setActiveModal(type);
  };

  return (
    <div className={s.homeShell}>
      <div className={s.homeGlow} />

      <button
        className={s.homeInfoBtn}
        onClick={() => openModal("info")}
        aria-label="ინფორმაცია"
      >
        <Info className="w-5 h-5" />
      </button>

      <main className={s.homeScreen}>
        <HomeHero />
        <ActionCards openModal={openModal} />
      </main>

      {activeModal && (
        <div
          className={cn(s.homeModalOverlay, modalVisible && s.homeModalOverlayVisible)}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className={cn(s.homeModalPanel, modalVisible && s.homeModalPanelVisible)}>
            <div className={s.homeModalHeader}>
              <div className={s.homeModalHeaderLeft}>
                <div className={cn(
                  s.homeModalIcon,
                  activeModal === "create" ? s.homeModalIconCreate :
                  activeModal === "join" ? s.homeModalIconJoin :
                  "border border-primary/30 bg-primary/20 text-primary"
                )}>
                  {activeModal === "create" ? <Users className="h-5 w-5" /> :
                   activeModal === "join" ? <Gamepad2 className="h-5 w-5" /> :
                   <Info className="h-5 w-5" />}
                </div>
                <div>
                  <p className={s.homeModalKicker}>
                    {activeModal === "create" ? "ახალი ოთახი" :
                     activeModal === "join" ? "შეუერთდი" :
                     "ინფორმაცია"}
                  </p>
                  <h2 className={s.homeModalTitle}>
                    {activeModal === "create" ? "შექმენი ოთახი" :
                     activeModal === "join" ? "შეუერთდი ოთახს" :
                     "როგორ ვითამაშოთ"}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className={s.homeModalClose}
                onClick={closeModal}
                aria-label="დახურვა"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className={s.homeModalBody}>
              {activeModal === "create" ? (
                <CreateRoomModal
                  isCreating={isCreating}
                  onCreate={async (name, role) => {
                    if (role) {
                      const success = await createRoom(name, role);
                      if (success) closeModal();
                    }
                  }}
                />
              ) : activeModal === "join" ? (
                <JoinRoomModal
                  isJoining={isJoining}
                  onJoin={async (name, pin, role) => {
                    if (role) {
                      const success = await joinRoom(name, pin, role);
                      if (success) closeModal();
                    }
                  }}
                  showRoleError={showRoleError}
                  setShowRoleError={setShowRoleError}
                  initialPin={initialPin}
                />
              ) : (
                <InfoModal />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
