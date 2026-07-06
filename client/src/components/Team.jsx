// ─────────────────────────────────────────────────────────
// Team – Clean profile cards with photo and name only
// ─────────────────────────────────────────────────────────

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

const teamMembers = [
  {
    name: "Shashank Rai",
    role: "Developer",
    image: "https://res.cloudinary.com/dft7k0axp/image/upload/v1776016778/smart_campus_team/mycclpyhxehnxccup225.png",
  },
  {
    name: "Shubham Shukla",
    role: "Developer",
    image: "https://res.cloudinary.com/dft7k0axp/image/upload/v1776017025/smart_campus_team/ohqauafzphiaflplnnn4.png",
  }
];

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }
  })
};

function TeamCard({ member, index }) {
  const [tilt, setTilt] = useState({});
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - y) * 10;
    const rotateY = (x - 0.5) * 10;

    setTilt({
      transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      transition: 'none'
    });
  };

  const handleMouseLeave = () => {
    setTilt({
      transform: 'perspective(800px) rotateX(0deg) rotateY(0deg)',
      transition: 'transform 0.45s ease'
    });
  };

  return (
    <motion.div
      className="team-card-wrap"
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeUp}
    >
      <div
        ref={cardRef}
        className="team-card"
        style={tilt}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="team-card__front">
          <div className="team-card__ring">
            <img src={member.image} alt={member.name} />
          </div>
          <h3 className="team-card__name">{member.name}</h3>
          <p className="team-card__role">{member.role}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Team() {
  return (
    <section id="team" className="aura-team">
      <motion.div
        className="aura-team__header"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <span className="aura-hero__eyebrow">✦ THE TEAM</span>
        <h2 className="aura-features__title">
          Meet the Minds Behind OmniCampus
        </h2>
        <p className="aura-features__subtitle">
          The engineering team pushing the boundaries of campus intelligence.
        </p>
      </motion.div>

      <div className="team-grid">
        {teamMembers.map((member, idx) => (
          <TeamCard key={idx} member={member} index={idx} />
        ))}
      </div>
    </section>
  );
}
