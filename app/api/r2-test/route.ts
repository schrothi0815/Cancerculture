import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/r2";

export async function GET() {
  const res = await r2.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME!,
      MaxKeys: 1,
    })
  );

  return Response.json({
    ok: true,
    objects: res.Contents ?? [],
  });
}
