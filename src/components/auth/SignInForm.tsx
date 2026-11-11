import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import LeagueBrand from "../common/LeagueBrand";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/");
  };

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <Link to="/" aria-label="Front Office Baseball home" className="rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20">
          <LeagueBrand className="justify-center" />
        </Link>
        <div className="my-6 flex w-full items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
          <span className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-400">Your leagues. Your front office.</span>
          <span className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="mt-6">
          <h1 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sign in to see your leagues and manage your teams.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <Label>Email</Label>
          <Input type="email" name="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 rounded-xl" />
        </div>
        <div>
          <Label>Password</Label>
          <div className="relative">
            <Input type={showPassword ? "text" : "password"} name="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 rounded-xl pr-12" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 z-30 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeIcon className="size-5 fill-current" /> : <EyeCloseIcon className="size-5 fill-current" />}
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <Checkbox checked={isChecked} onChange={setIsChecked} />
          Keep me signed in
        </label>
        {error && <p className="rounded-xl bg-error-50 px-4 py-3 text-sm font-medium text-error-600 dark:bg-error-500/10 dark:text-error-400" role="alert">{error}</p>}
        <Button className="w-full rounded-xl bg-emerald-600 py-3.5 font-bold hover:bg-emerald-700 disabled:bg-emerald-400" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-gray-500 dark:text-gray-400">
        Need an account? <Link to="/signup" className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400">Create one</Link>
      </p>
      <p className="mt-6 border-t border-gray-100 pt-5 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:border-gray-800">Front Office Baseball · One account, all your leagues</p>
    </div>
  );
}
