import { HelmetProvider, Helmet } from "react-helmet-async";

const APP_TITLE = "Front Office Baseball League";

const PageMeta = ({
  description,
}: {
  title: string;
  description: string;
}) => (
  <Helmet>
    <title>{APP_TITLE}</title>
    <meta name="description" content={description} />
  </Helmet>
);

export const AppWrapper = ({ children }: { children: React.ReactNode }) => (
  <HelmetProvider>{children}</HelmetProvider>
);

export default PageMeta;
