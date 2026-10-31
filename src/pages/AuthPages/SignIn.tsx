import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Poolsters Sign In | Front Office Baseball"
        description="Sign in to the Poolsters dynasty league, hosted by Front Office Baseball."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
