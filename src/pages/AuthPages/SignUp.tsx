import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignUpForm from "../../components/auth/SignUpForm";

export default function SignUp() {
  return (
    <>
      <PageMeta
        title="Create Account | Front Office Baseball League"
        description="Create your Front Office Baseball League account."
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}
