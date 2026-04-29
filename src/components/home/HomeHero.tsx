const HomeHero = () => {
  return (
    <section className="home-hero">
      <div className="home-logo-wrap">
        <img
          src="/jokerlogo.png"
          alt="ხუმარა"
          className="home-logo-img"
          draggable={false}
        />
        <div className="home-logo-glow" />
      </div>
      <h1 className="home-brand">ხუმარა</h1>
      <p className="home-subtitle">PARTY GAME</p>
    </section>
  );
};

export default HomeHero;
