import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Sign In | Front Office Baseball"
        description="Sign in to view your Front Office Baseball leagues and teams."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
