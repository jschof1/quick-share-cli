#!/usr/bin/env python3
"""
Quick Image Uploader - Upload images to Cloudflare R2 and get instant links.
Usage: python upload.py <image-file>
"""

import sys
import os
import boto3
from botocore.config import Config
from datetime import datetime
import subprocess

CONFIG_FILE = os.path.expanduser("~/.r2-config-py")

def load_config():
    """Load configuration from file."""
    config = {}
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    config[key] = value.strip('"')
    return config

def save_config(config):
    """Save configuration to file."""
    with open(CONFIG_FILE, 'w') as f:
        for key, value in config.items():
            f.write(f'{key}="{value}"\n')
    os.chmod(CONFIG_FILE, 0o600)

def setup():
    """Interactive setup for R2 credentials."""
    print("=== Cloudflare R2 Setup ===\n")
    
    print("Step 1: Get your credentials from https://dash.cloudflare.com/ → R2 → Manage R2 API Tokens")
    account_id = input("R2 Account ID: ").strip()
    access_key = input("R2 Access Key ID: ").strip()
    secret_key = input("R2 Secret Access Key: ").strip()
    bucket = input("Bucket Name: ").strip()
    public_url = input("Public URL (e.g., https://images.yourdomain.com): ").strip().rstrip('/')
    
    config = {
        'R2_ACCOUNT_ID': account_id,
        'R2_ACCESS_KEY_ID': access_key,
        'R2_SECRET_ACCESS_KEY': secret_key,
        'BUCKET_NAME': bucket,
        'R2_PUBLIC_URL': public_url,
        'R2_ENDPOINT': f"https://{account_id}.r2.cloudflarestorage.com"
    }
    
    save_config(config)
    print(f"\n✓ Config saved to {CONFIG_FILE}")

def copy_to_clipboard(text):
    """Copy text to clipboard."""
    # macOS
    if subprocess.run(['which', 'pbcopy'], capture_output=True).returncode == 0:
        subprocess.run(['pbcopy'], input=text.encode())
        return True
    # Linux with xclip
    if subprocess.run(['which', 'xclip'], capture_output=True).returncode == 0:
        subprocess.run(['xclip', '-selection', 'clipboard'], input=text.encode())
        return True
    # Linux with wl-copy (Wayland)
    if subprocess.run(['which', 'wl-copy'], capture_output=True).returncode == 0:
        subprocess.run(['wl-copy'], input=text.encode())
        return True
    return False

def upload_image(filepath):
    """Upload image to R2."""
    config = load_config()
    
    if not config:
        print("No config found. Running setup...")
        setup()
        config = load_config()
    
    # Initialize S3 client for R2
    s3 = boto3.client(
        's3',
        endpoint_url=config['R2_ENDPOINT'],
        aws_access_key_id=config['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=config['R2_SECRET_ACCESS_KEY'],
        config=Config(signature_version='s3v4'),
        region_name='auto'
    )
    
    # Generate unique filename
    basename = os.path.basename(filepath)
    timestamp = int(datetime.now().timestamp())
    key = f"{timestamp}-{basename}"
    
    # Upload
    print(f"Uploading {basename}...")
    s3.upload_file(
        filepath, 
        config['BUCKET_NAME'], 
        key,
        ExtraArgs={'ACL': 'public-read'}
    )
    
    # Generate URL
    public_url = f"{config['R2_PUBLIC_URL']}/{key}"
    
    print("\n✓ Upload complete!\n")
    print(f"URL: {public_url}")
    print(f"\nMarkdown: ![image]({public_url})")
    print(f"\nHTML: <img src=\"{public_url}\" alt=\"image\">")
    
    if copy_to_clipboard(public_url):
        print("\n✓ URL copied to clipboard!")
    
    return public_url

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python upload.py <image-file>")
        print("       python upload.py --setup    # Run setup")
        sys.exit(1)
    
    if sys.argv[1] == '--setup':
        setup()
    else:
        filepath = sys.argv[1]
        if not os.path.exists(filepath):
            print(f"Error: File '{filepath}' not found")
            sys.exit(1)
        upload_image(filepath)
