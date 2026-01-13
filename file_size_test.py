#!/usr/bin/env python3
"""
Enhanced Proof Upload File Size Testing

This test specifically focuses on testing the file size limits more accurately
by creating files that are guaranteed to exceed the limits.
"""

import requests
import json
import uuid
import base64
import io
import zipfile
from datetime import datetime
import os
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / 'frontend' / '.env')

# Configuration
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://trackingsync.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Test order ID from review request
TEST_ORDER_ID = "81695e32-4681-4de3-a3ea-909be91d50ba"
TEST_STAGE = "clay"

class FileSizeTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
    
    def log(self, message):
        """Log test messages"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def login(self):
        """Login as admin"""
        try:
            login_data = {
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{API_BASE}/admin/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and "token" in data:
                    self.admin_token = data["token"]
                    self.log("✅ Admin login successful")
                    return True
            
            self.log(f"❌ Login failed with status {response.status_code}")
            return False
                
        except Exception as e:
            self.log(f"❌ Exception during admin login: {e}")
            return False
    
    def create_large_file(self, size_mb):
        """Create a file of exactly the specified size in MB"""
        size_bytes = size_mb * 1024 * 1024
        # Create binary data
        data = b'A' * size_bytes
        return data
    
    def create_large_zip(self, size_mb):
        """Create a ZIP file of approximately the specified size"""
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_STORED) as zip_file:  # No compression for predictable size
            # Create a large file inside the ZIP
            large_data = self.create_large_file(size_mb - 1)  # Leave room for ZIP overhead
            zip_file.writestr("large_file.txt", large_data)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    def test_file_size_enforcement(self):
        """Test that file size limits are properly enforced"""
        if not self.login():
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        self.log("=" * 60)
        self.log("TESTING FILE SIZE ENFORCEMENT")
        self.log("=" * 60)
        
        # Test 1: 11MB image (should fail - limit is 10MB)
        self.log("Test 1: Uploading 11MB image (should be rejected)...")
        large_image = self.create_large_file(11)
        
        files = {
            'files': ('large_image_11mb.bin', large_image, 'image/png')
        }
        data = {
            'stage': TEST_STAGE,
            'revision_note': 'Testing 11MB image rejection'
        }
        
        try:
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 413:
                self.log("✅ 11MB image correctly rejected with 413 status")
            else:
                self.log(f"❌ 11MB image should return 413, got {response.status_code}")
                if response.status_code == 200:
                    self.log("   This indicates file size validation is not working properly")
        except Exception as e:
            self.log(f"❌ Exception testing 11MB image: {e}")
        
        # Test 2: 21MB ZIP (should fail - limit is 20MB)
        self.log("Test 2: Uploading 21MB ZIP (should be rejected)...")
        large_zip = self.create_large_zip(21)
        
        files = {
            'files': ('large_zip_21mb.zip', large_zip, 'application/zip')
        }
        data = {
            'stage': TEST_STAGE,
            'revision_note': 'Testing 21MB ZIP rejection'
        }
        
        try:
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 413:
                self.log("✅ 21MB ZIP correctly rejected with 413 status")
            else:
                self.log(f"❌ 21MB ZIP should return 413, got {response.status_code}")
                if response.status_code == 200:
                    self.log("   This indicates ZIP file size validation is not working properly")
        except Exception as e:
            self.log(f"❌ Exception testing 21MB ZIP: {e}")
        
        # Test 3: 9MB image (should succeed - under 10MB limit)
        self.log("Test 3: Uploading 9MB image (should be accepted)...")
        normal_image = self.create_large_file(9)
        
        files = {
            'files': ('normal_image_9mb.bin', normal_image, 'image/png')
        }
        data = {
            'stage': TEST_STAGE,
            'revision_note': 'Testing 9MB image acceptance'
        }
        
        try:
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                self.log("✅ 9MB image correctly accepted")
            else:
                self.log(f"❌ 9MB image should be accepted, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log(f"❌ Exception testing 9MB image: {e}")
        
        # Test 4: 19MB ZIP (should succeed - under 20MB limit)
        self.log("Test 4: Uploading 19MB ZIP (should be accepted)...")
        normal_zip = self.create_large_zip(19)
        
        files = {
            'files': ('normal_zip_19mb.zip', normal_zip, 'application/zip')
        }
        data = {
            'stage': TEST_STAGE,
            'revision_note': 'Testing 19MB ZIP acceptance'
        }
        
        try:
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                self.log("✅ 19MB ZIP correctly accepted")
            else:
                self.log(f"❌ 19MB ZIP should be accepted, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log(f"❌ Exception testing 19MB ZIP: {e}")
        
        self.log("=" * 60)
        self.log("FILE SIZE TESTING COMPLETE")
        self.log("=" * 60)

def main():
    """Main test runner"""
    tester = FileSizeTester()
    tester.test_file_size_enforcement()

if __name__ == "__main__":
    main()