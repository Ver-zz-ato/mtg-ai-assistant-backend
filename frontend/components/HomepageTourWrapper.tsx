"use client";

import dynamic from 'next/dynamic';

// Client-side only tour component
const MainFeaturesTour = dynamic(() => import('./MainFeaturesTour'), { 
  ssr: false 
});

export default function HomepageTourWrapper() {
  return <MainFeaturesTour autoStart={true} />;
}

