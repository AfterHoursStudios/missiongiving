import ConfirmationPage from "../../(public)/donate/confirmation/page";

// The thank-you page after paying through an embedded form: the same page as /donate/confirmation, without the site
// header and footer (the embed layout replaces them).
export const dynamic = "force-dynamic";
export const metadata = { title: "Thank you", robots: { index: false, follow: false } };
export default ConfirmationPage;
