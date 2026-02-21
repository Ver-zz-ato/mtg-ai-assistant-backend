"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type CommunityDrawerProps = {
  children: React.ReactNode;
};

export default function CommunityDrawer({ children }: CommunityDrawerProps) {
  const [open, setOpen] = React.useState(false);

  // Close drawer when resizing to md+ (desktop has sidebar)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Community button - visible only below md (768px); positioned above FeedbackFab */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-16 left-4 z-40 md:hidden rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
        aria-label="Open Community"
      >
        Community
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/40"
              aria-hidden="true"
            />

            {/* Slide-over panel */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[85%] max-w-[360px] bg-neutral-950 border-r border-neutral-800 shadow-xl overflow-y-auto"
              role="dialog"
              aria-label="Community"
            >
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-neutral-100">Community</h2>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-md p-2 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                    aria-label="Close"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
