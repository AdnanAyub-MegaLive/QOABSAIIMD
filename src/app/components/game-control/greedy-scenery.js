"use client";

import {useEffect, useState} from "react";
import styles from "./greedy.module.css";

export default function GreedyScenery() {
  const [birds, setBirds] = useState([]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;
    let generation = 0;
    function launch() {
      clearTimeout(timer);
      if (motion.matches || document.hidden) {
        setBirds([]);
        return;
      }
      generation += 1;
      setBirds(Array.from({length: Math.random() < 0.5 ? 2 : 3}, (_, index) => ({
        id: `${generation}-${index}`,
        reverse: Math.random() < 0.5,
        top: 8 + index * 19 + Math.random() * 10,
        size: 80 + Math.random() * 24,
        duration: 9 + Math.random() * 5,
        delay: index * 1.3 + Math.random(),
      })));
      timer = setTimeout(launch, 19000 + Math.random() * 5000);
    }
    launch();
    document.addEventListener("visibilitychange", launch);
    motion.addEventListener("change", launch);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", launch);
      motion.removeEventListener("change", launch);
    };
  }, []);
  return <div className={styles.scenery} aria-hidden="true">
    {birds.map(bird => <span key={bird.id} className={styles.birdFlight} data-reverse={bird.reverse}
      style={{top: `${bird.top}%`, "--bird-size": `${bird.size}px`, animationDuration: `${bird.duration}s`, animationDelay: `${bird.delay}s`}}>
      {/* Keep the supplied GIF animated; mirror only the right-to-left flights. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/games/greedy/bird.gif" alt="" draggable={false}/>
    </span>)}
  </div>;
}
