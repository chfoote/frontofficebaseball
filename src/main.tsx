import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element.");
}

const root = createRoot(rootElement);
const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const hasSupabaseConfig = configuredSupabaseUrl && import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!hasSupabaseConfig) {
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12 text-gray-900 dark:bg-gray-950 dark:text-white">
      <section
        aria-labelledby="setup-title"
        className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-8 shadow-theme-md dark:border-gray-800 dark:bg-gray-900"
      >
        <h1 id="setup-title" className="text-2xl font-bold">
          Local setup required
        </h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          The app needs Supabase credentials to start. Copy .env.example to .env,
          then add the values from the standalone Front Office Baseball project.
        </p>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Copy{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
            .env.example
          </code>{" "}
          to{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
            .env
          </code>
          , then set{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
            VITE_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
            VITE_SUPABASE_ANON_KEY
          </code>{" "}
          to the values from your Supabase project’s API settings.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-lg bg-gray-100 p-4 text-sm dark:bg-gray-800">
          cp .env.example .env
        </pre>
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Save the new baseball credentials and restart the local dev server.
        </p>
      </section>
    </main>,
  );
} else {
  void Promise.all([
    import("./App.tsx"),
    import("./components/common/PageMeta.tsx"),
    import("./context/ThemeContext.tsx"),
    import("./context/AuthContext.tsx"),
  ])
    .then(([{ default: App }, { AppWrapper }, { ThemeProvider }, { AuthProvider }]) => {
      root.render(
        <StrictMode>
          <ThemeProvider>
            <AuthProvider>
              <AppWrapper>
                <App />
              </AppWrapper>
            </AuthProvider>
          </ThemeProvider>
        </StrictMode>,
      );
    })
    .catch((error: unknown) => {
      console.error("Failed to load the app:", error);
      root.render(
        <main
          aria-live="polite"
          className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-gray-900 dark:bg-gray-950 dark:text-white"
        >
          <p>Failed to load the app. Check the browser console for details.</p>
        </main>,
      );
    });
}
