import { useState, useEffect } from "react";
import { Users, Gamepad2, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalType } from "@/types/game";
import { useRoomSetup } from "@/hooks/useRoomSetup";
import styles from "@/components/home/Home.module.css";

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
    <div className={styles["home-shell"]}>
      {/* Background glow effects */}
      <div className={styles["home-glow"]} />

      <button 
        className={styles["home-info-btn"]}
        onClick={() => openModal("info")}
        aria-label="ინფორმაცია"
      >
        <Info className="w-5 h-5" />
      </button>

      {/* Main content */}
      <main className={styles["home-screen"]}>
        <HomeHero />
        <ActionCards openModal={openModal} />
      </main>

      {/* Modal Overlay */}
      {activeModal && (
        <div
          className={cn(styles["home-modal-overlay"], modalVisible && styles["home-modal-overlay-visible"])}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className={cn(styles["home-modal-panel"], modalVisible && styles["home-modal-panel-visible"])}>
            {/* Modal Header */}
            <div className={styles["home-modal-header"]}>
              <div className={styles["home-modal-header-left"]}>
                <div className={cn(
                  styles["home-modal-icon"],
                  activeModal === "create" ? styles["home-modal-icon-create"] : 
                  activeModal === "join" ? styles["home-modal-icon-join"] : 
                  "border border-primary/30 bg-primary/20 text-primary"
                )}>
                  {activeModal === "create" ? <Users className="h-5 w-5" /> : 
                   activeModal === "join" ? <Gamepad2 className="h-5 w-5" /> : 
                   <Info className="h-5 w-5" />}
                </div>
                <div>
                  <p className={styles["home-modal-kicker"]}>
                    {activeModal === "create" ? "ახალი ოთახი" : 
                     activeModal === "join" ? "შეუერთდი" : 
                     "ინფორმაცია"}
                  </p>
                  <h2 className={styles["home-modal-title"]}>
                    {activeModal === "create" ? "შექმენი ოთახი" : 
                     activeModal === "join" ? "შეუერთდი ოთახს" : 
                     "როგორ ვითამაშოთ"}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className={styles["home-modal-close"]}
                onClick={closeModal}
                aria-label="დახურვა"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className={styles["home-modal-body"]}>
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
