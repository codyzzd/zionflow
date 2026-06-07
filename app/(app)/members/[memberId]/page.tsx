import { redirect } from "next/navigation";

export default async function MemberDetailRedirect({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;

  redirect(`/members?member=${encodeURIComponent(memberId)}`);
}
