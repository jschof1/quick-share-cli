# Example: Custom Configuration

You can use a custom configuration file by specifying it with the `--config` flag:

```bash
quick-share upload myfile.pdf --config ./my-custom-config.json
```

## Configuration Format

```json
{
  "accountId": "your-cloudflare-account-id",
  "accessKeyId": "your-r2-access-key",
  "secretAccessKey": "your-r2-secret-key",
  "bucketName": "my-uploads",
  "publicUrl": "https://images.mydomain.com"
}
```

## Multiple Buckets

You can maintain multiple config files for different buckets:

```bash
# Personal uploads
quick-share upload photo.jpg --config ~/.quick-share/personal.json

# Work uploads
quick-share upload report.pdf --config ~/.quick-share/work.json
```

## Environment Variables

You can also use environment variables (not recommended for security):

```bash
export R2_ACCOUNT_ID="your-account-id"
export R2_ACCESS_KEY_ID="your-access-key"
export R2_SECRET_ACCESS_KEY="your-secret-key"
export R2_BUCKET_NAME="your-bucket"
export R2_PUBLIC_URL="https://pub-xxxxx.r2.dev"
```
