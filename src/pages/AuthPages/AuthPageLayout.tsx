import React from "react";
import GridShape from "../../components/common/GridShape";
import { Link } from "react-router";
import ThemeTogglerTwo from "../../components/common/ThemeTogglerTwo";
import LeagueBrand from "../../components/common/LeagueBrand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}
        <div className="items-center hidden w-full h-full overflow-hidden lg:w-1/2 bg-brand-950 dark:bg-gray-950 lg:grid">
          <div className="relative flex items-center justify-center z-1">
            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />
            <div className="flex flex-col items-center max-w-lg px-10">
              <Link
                to="/"
                className="block rounded-3xl bg-white p-5 shadow-2xl shadow-black/30"
                aria-label="Front Office Baseball League home"
              >
                <LeagueBrand className="scale-125" />
              </Link>
              <p className="mt-6 text-center text-lg font-medium text-white/80">
                Welcome to the Front Office Baseball League
              </p>
            </div>
          </div>
        </div>
        <div className="fixed z-50 hidden bottom-6 right-6 sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
