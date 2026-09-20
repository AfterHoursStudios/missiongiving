import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

export interface CampaignEmailProps {
  bodyHtml: string;            // already filled and sanitized
  orgName: string;
  orgAddress: string;
  unsubscribeUrl: string;
  preview?: string;
}

/** Responsive campaign layout. Every message carries the sender's mailing address and an unsubscribe link. */
export function CampaignEmail({ bodyHtml, orgName, orgAddress, unsubscribeUrl, preview }: CampaignEmailProps) {
  return (
    <Html lang="en">
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ backgroundColor: "#f7faf7", margin: 0, padding: "24px 0", fontFamily: "Helvetica, Arial, sans-serif", color: "#14262b" }}>
        <Container style={{ maxWidth: 600, backgroundColor: "#ffffff", padding: "32px 28px" }}>
          <Text style={{ fontSize: 20, fontWeight: 700, color: "#024352", margin: "0 0 20px" }}>{orgName}</Text>
          <Section>
            <div style={{ fontSize: 16, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Section>
          <Hr style={{ borderColor: "#cfe0d6", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 12, lineHeight: 1.5, color: "#46595f", margin: 0 }}>
            You are receiving this because you chose to hear from {orgName}. {orgAddress}
          </Text>
          <Text style={{ fontSize: 12, color: "#46595f", margin: "8px 0 0" }}>
            <Link href={unsubscribeUrl} style={{ color: "#46595f", textDecoration: "underline" }}>Unsubscribe</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
