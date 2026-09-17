import { redirect } from 'next/navigation';

// Partner registration lives in the Partner Portal; this keeps the
// /auth/partner-register link working.
export default function PartnerRegisterRedirect() {
  redirect('/partner/signup');
}
