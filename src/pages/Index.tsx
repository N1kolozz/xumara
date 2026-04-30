import { useState, useEffect } from "react";
import { Users, Gamepad2, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalType } from "@/types/game";
import { useRoomSetup } from "@/hooks/useRoomSetup";

import HomeHero from "@/components/home/HomeHero";
import ActionCards from "@/components/home/ActionCards";
import { CreateRoomModal } from "@/components/home/CreateRoomModal";
import { JoinRoomModal } from "@/components/home/JoinRoomModal";
import { InfoModal } from "@/components/home/InfoModal";

const Index = () => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const {
    createRoom,
    joinRoom,
    isCreating,
    isJoining,
    showRoleError,
    setShowRoleError,
  } = useRoomSetup();

  // Animate modal in/out
  useEffect(() => {
    if (activeModal) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setModalVisible(true));
      });
    }
  }, [activeModal]);

  const closeModal = () => {
    // Blur any focused input to dismiss the keyboard before closing
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
    <div className="home-shell">
      {/* Background glow effects */}
      <div className="home-glow" />

      <button 
        className="home-info-btn"
        onClick={() => openModal("info")}
        aria-label="ინფორმაცია"
      >
        <Info className="w-5 h-5" />
      </button>

      {/* Main content */}
      <main className="home-screen">
        <HomeHero />
        <ActionCards openModal={openModal} />
      </main>

      {/* Modal Overlay */}
      {activeModal && (
        <div
          className={cn("home-modal-overlay", modalVisible && "home-modal-overlay-visible")}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className={cn("home-modal-panel", modalVisible && "home-modal-panel-visible")}>
            {/* Modal Header */}
            <div className="home-modal-header">
              <div className="home-modal-header-left">
                <div className={cn(
                  "home-modal-icon",
                  activeModal === "create" ? "home-modal-icon-create" : 
                  activeModal === "join" ? "home-modal-icon-join" : 
                  "border border-primary/30 bg-primary/20 text-primary"
                )}>
                  {activeModal === "create" ? <Users className="h-5 w-5" /> : 
                   activeModal === "join" ? <Gamepad2 className="h-5 w-5" /> : 
                   <Info className="h-5 w-5" />}
                </div>
                <div>
                  <p className="home-modal-kicker">
                    {activeModal === "create" ? "ახალი ოთახი" : 
                     activeModal === "join" ? "შეუერთდი" : 
                     "ინფორმაცია"}
                  </p>
                  <h2 className="home-modal-title">
                    {activeModal === "create" ? "შექმენი ოთახი" : 
                     activeModal === "join" ? "შეუერთდი ოთახს" : 
                     "როგორ ვითამაშოთ"}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="home-modal-close"
                onClick={closeModal}
                aria-label="დახურვა"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="home-modal-body">
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
