import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Sign In | Front Office Baseball League"
        description="Sign in to the Front Office Baseball League."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
