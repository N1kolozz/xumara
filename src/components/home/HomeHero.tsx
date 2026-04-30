import styles from "./Home.module.css";

const HomeHero = () => {
  return (
    <section className={styles["home-hero"]}>
      <div className={styles["home-logo-wrap"]}>
        <img
          src="/jokerlogo.png"
          alt="ხუმარა"
          className={styles["home-logo-img"]}
          draggable={false}
        />
        <div className={styles["home-logo-glow"]} />
      </div>
      <h1 className={styles["home-brand"]}>ხუმარა</h1>
      <p className={styles["home-subtitle"]}>PARTY GAME</p>
    </section>
  );
};

export default HomeHero;
