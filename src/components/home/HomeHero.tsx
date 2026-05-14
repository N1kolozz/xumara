import s from "./Home.module.css";

const HomeHero = () => {
  return (
    <section className={s.homeHero}>
      <div className={s.homeLogoWrap}>
        <img
          src="/jokerlogo.png"
          alt="ხუმარა"
          className={s.homeLogoImg}
          draggable={false}
        />
        <div className={s.homeLogoGlow} />
      </div>
      <h1 className={s.homeBrand}>ხუმარა</h1>
      <p className={s.homeSubtitle}>PARTY GAME</p>
    </section>
  );
};

export default HomeHero;
