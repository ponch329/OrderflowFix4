#!/usr/bin/env python3
"""
Proof Upload Functionality Testing for Bobblehead Proof Approval System

Tests the following proof upload improvements:
1. Backend Proof Upload Endpoint (POST /api/admin/orders/{order_id}/proofs)
2. File Size Limits (ZIP files up to 20MB, individual images up to 10MB)
3. API Response Format
4. Error Handling for oversized files

Usage: python proof_upload_test.py
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
from PIL import Image

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / 'frontend' / '.env')

# Configuration
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://workflow-config-test-1.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Test order ID from review request
TEST_ORDER_ID = "81695e32-4681-4de3-a3ea-909be91d50ba"
TEST_STAGE = "clay"

class ProofUploadTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.results = {
            "admin_login": {"passed": False, "details": ""},
            "proof_upload_basic": {"passed": False, "details": ""},
            "file_size_limits": {"passed": False, "details": ""},
            "api_response_format": {"passed": False, "details": ""},
            "zip_file_upload": {"passed": False, "details": ""}
        }
    
    def log(self, message):
        """Log test messages"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def test_admin_login(self):
        """Test admin login authentication"""
        self.log("Testing Admin Login Authentication...")
        
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
                    self.results["admin_login"]["passed"] = True
                    self.results["admin_login"]["details"] = f"✅ Admin login successful. Token received."
                    self.log("✅ Admin login successful")
                else:
                    self.results["admin_login"]["details"] = f"❌ Login response missing required fields: {data}"
                    self.log("❌ Login response missing required fields")
            else:
                self.results["admin_login"]["details"] = f"❌ Login failed with status {response.status_code}: {response.text}"
                self.log(f"❌ Login failed with status {response.status_code}")
                
        except Exception as e:
            self.results["admin_login"]["details"] = f"❌ Exception during admin login test: {str(e)}"
            self.log(f"❌ Exception during admin login test: {e}")
    
    def create_test_image(self, width=100, height=100, format='PNG'):
        """Create a test image of specified size"""
        img = Image.new('RGB', (width, height), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format=format)
        img_bytes.seek(0)
        return img_bytes.getvalue()
    
    def create_large_image(self, size_mb):
        """Create a large image of approximately specified size in MB"""
        # Calculate dimensions to get approximately the target size
        # PNG compression varies, so we'll create a larger image to ensure we exceed the limit
        target_pixels = int((size_mb * 1024 * 1024) / 3)  # 3 bytes per pixel (RGB)
        width = int(target_pixels ** 0.5)
        height = width
        
        img = Image.new('RGB', (width, height), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        return img_bytes.getvalue()
    
    def create_test_zip(self, num_images=3, image_size_kb=50):
        """Create a test ZIP file with multiple images"""
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for i in range(num_images):
                # Create small test images
                img_data = self.create_test_image(100, 100, 'JPEG')
                zip_file.writestr(f"test_image_{i+1}.jpg", img_data)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    def create_large_zip(self, size_mb):
        """Create a large ZIP file exceeding the size limit"""
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Create enough images to exceed the size limit
            num_images = max(1, int(size_mb / 2))  # Rough estimate
            for i in range(num_images):
                # Create larger images to reach target size
                img_data = self.create_test_image(1000, 1000, 'PNG')
                zip_file.writestr(f"large_image_{i+1}.png", img_data)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    def test_proof_upload_basic(self):
        """Test basic proof upload functionality"""
        self.log("Testing Basic Proof Upload...")
        
        if not self.admin_token:
            self.results["proof_upload_basic"]["details"] = "❌ Cannot test - admin login failed"
            self.log("❌ Cannot test proof upload - admin login failed")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Create a small test image
            image_data = self.create_test_image()
            
            # Prepare multipart form data
            files = {
                'files': ('test_proof.png', image_data, 'image/png')
            }
            data = {
                'stage': TEST_STAGE,
                'revision_note': 'Test upload from automated testing'
            }
            
            # Upload proof
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result and "proofs" in result and "round" in result:
                    self.results["proof_upload_basic"]["passed"] = True
                    self.results["proof_upload_basic"]["details"] = f"✅ Basic proof upload successful. Message: {result['message']}, Proofs uploaded: {len(result['proofs'])}, Round: {result['round']}"
                    self.log(f"✅ Basic proof upload successful - {len(result['proofs'])} proof(s) uploaded")
                else:
                    self.results["proof_upload_basic"]["details"] = f"❌ Proof upload response missing required fields: {result}"
                    self.log("❌ Proof upload response missing required fields")
            elif response.status_code == 404:
                self.results["proof_upload_basic"]["details"] = f"❌ Order {TEST_ORDER_ID} not found. Please verify the order ID exists."
                self.log(f"❌ Order {TEST_ORDER_ID} not found")
            else:
                self.results["proof_upload_basic"]["details"] = f"❌ Proof upload failed with status {response.status_code}: {response.text}"
                self.log(f"❌ Proof upload failed with status {response.status_code}")
                
        except Exception as e:
            self.results["proof_upload_basic"]["details"] = f"❌ Exception during basic proof upload test: {str(e)}"
            self.log(f"❌ Exception during basic proof upload test: {e}")
    
    def test_file_size_limits(self):
        """Test file size limits (10MB for images, 20MB for ZIP files)"""
        self.log("Testing File Size Limits...")
        
        if not self.admin_token:
            self.results["file_size_limits"]["details"] = "❌ Cannot test - admin login failed"
            self.log("❌ Cannot test file size limits - admin login failed")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Test 1: Upload image larger than 10MB (should fail with 413)
            self.log("Testing oversized image (>10MB)...")
            large_image = self.create_large_image(12)  # 12MB image
            
            files = {
                'files': ('large_test.png', large_image, 'image/png')
            }
            data = {
                'stage': TEST_STAGE,
                'revision_note': 'Testing large image rejection'
            }
            
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers
            )
            
            large_image_test_passed = False
            if response.status_code == 413:
                self.log("✅ Large image correctly rejected with 413 status")
                large_image_test_passed = True
            else:
                self.log(f"❌ Large image should return 413, got {response.status_code}")
            
            # Test 2: Upload ZIP larger than 20MB (should fail with 413)
            self.log("Testing oversized ZIP (>20MB)...")
            large_zip = self.create_large_zip(25)  # 25MB ZIP
            
            files = {
                'files': ('large_test.zip', large_zip, 'application/zip')
            }
            data = {
                'stage': TEST_STAGE,
                'revision_note': 'Testing large ZIP rejection'
            }
            
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers
            )
            
            large_zip_test_passed = False
            if response.status_code == 413:
                self.log("✅ Large ZIP correctly rejected with 413 status")
                large_zip_test_passed = True
            else:
                self.log(f"❌ Large ZIP should return 413, got {response.status_code}")
            
            # Test 3: Upload acceptable size image (should succeed)
            self.log("Testing acceptable size image (<10MB)...")
            normal_image = self.create_test_image(500, 500)  # Small image
            
            files = {
                'files': ('normal_test.png', normal_image, 'image/png')
            }
            data = {
                'stage': TEST_STAGE,
                'revision_note': 'Testing normal size acceptance'
            }
            
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers
            )
            
            normal_image_test_passed = False
            if response.status_code == 200:
                self.log("✅ Normal size image accepted successfully")
                normal_image_test_passed = True
            else:
                self.log(f"❌ Normal size image should be accepted, got {response.status_code}")
            
            # Overall result
            if large_image_test_passed and large_zip_test_passed and normal_image_test_passed:
                self.results["file_size_limits"]["passed"] = True
                self.results["file_size_limits"]["details"] = "✅ File size limits working correctly. Large image (>10MB) rejected with 413, large ZIP (>20MB) rejected with 413, normal size image accepted."
            else:
                failed_tests = []
                if not large_image_test_passed:
                    failed_tests.append("large image rejection")
                if not large_zip_test_passed:
                    failed_tests.append("large ZIP rejection")
                if not normal_image_test_passed:
                    failed_tests.append("normal image acceptance")
                
                self.results["file_size_limits"]["details"] = f"❌ File size limit tests failed: {', '.join(failed_tests)}"
                
        except Exception as e:
            self.results["file_size_limits"]["details"] = f"❌ Exception during file size limits test: {str(e)}"
            self.log(f"❌ Exception during file size limits test: {e}")
    
    def test_api_response_format(self):
        """Test API response format contains required fields"""
        self.log("Testing API Response Format...")
        
        if not self.admin_token:
            self.results["api_response_format"]["details"] = "❌ Cannot test - admin login failed"
            self.log("❌ Cannot test API response format - admin login failed")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Create test image
            image_data = self.create_test_image()
            
            files = {
                'files': ('response_test.png', image_data, 'image/png')
            }
            data = {
                'stage': TEST_STAGE,
                'revision_note': 'Testing API response format'
            }
            
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Check required fields
                required_fields = ["message", "proofs", "round"]
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    # Check proofs array structure
                    proofs = result["proofs"]
                    if proofs and len(proofs) > 0:
                        proof = proofs[0]
                        proof_required_fields = ["id", "url", "filename", "uploaded_at", "round"]
                        missing_proof_fields = [field for field in proof_required_fields if field not in proof]
                        
                        if not missing_proof_fields:
                            self.results["api_response_format"]["passed"] = True
                            self.results["api_response_format"]["details"] = f"✅ API response format correct. Contains: message ('{result['message']}'), proofs array with {len(proofs)} item(s), round ({result['round']}). Proof objects contain all required fields: {', '.join(proof_required_fields)}."
                            self.log("✅ API response format is correct")
                        else:
                            self.results["api_response_format"]["details"] = f"❌ Proof objects missing required fields: {missing_proof_fields}"
                            self.log(f"❌ Proof objects missing required fields: {missing_proof_fields}")
                    else:
                        self.results["api_response_format"]["details"] = "❌ Proofs array is empty or missing"
                        self.log("❌ Proofs array is empty or missing")
                else:
                    self.results["api_response_format"]["details"] = f"❌ API response missing required fields: {missing_fields}"
                    self.log(f"❌ API response missing required fields: {missing_fields}")
            else:
                self.results["api_response_format"]["details"] = f"❌ Cannot test response format - upload failed with status {response.status_code}"
                self.log(f"❌ Cannot test response format - upload failed with status {response.status_code}")
                
        except Exception as e:
            self.results["api_response_format"]["details"] = f"❌ Exception during API response format test: {str(e)}"
            self.log(f"❌ Exception during API response format test: {e}")
    
    def test_zip_file_upload(self):
        """Test ZIP file upload functionality"""
        self.log("Testing ZIP File Upload...")
        
        if not self.admin_token:
            self.results["zip_file_upload"]["details"] = "❌ Cannot test - admin login failed"
            self.log("❌ Cannot test ZIP file upload - admin login failed")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            # Create test ZIP with multiple images
            zip_data = self.create_test_zip(num_images=3)
            
            files = {
                'files': ('test_proofs.zip', zip_data, 'application/zip')
            }
            data = {
                'stage': TEST_STAGE,
                'revision_note': 'Testing ZIP file upload with multiple images'
            }
            
            response = self.session.post(
                f"{API_BASE}/admin/orders/{TEST_ORDER_ID}/proofs",
                files=files,
                data=data,
                headers=headers
            )
            
            if response.status_code == 200:
                result = response.json()
                
                if "proofs" in result and len(result["proofs"]) >= 3:
                    # Check that multiple proofs were extracted from ZIP
                    proofs_count = len(result["proofs"])
                    self.results["zip_file_upload"]["passed"] = True
                    self.results["zip_file_upload"]["details"] = f"✅ ZIP file upload successful. Extracted {proofs_count} images from ZIP file. Message: {result.get('message', 'N/A')}"
                    self.log(f"✅ ZIP file upload successful - extracted {proofs_count} images")
                else:
                    self.results["zip_file_upload"]["details"] = f"❌ ZIP file upload did not extract expected number of images. Expected: 3, Got: {len(result.get('proofs', []))}"
                    self.log("❌ ZIP file upload did not extract expected number of images")
            else:
                self.results["zip_file_upload"]["details"] = f"❌ ZIP file upload failed with status {response.status_code}: {response.text}"
                self.log(f"❌ ZIP file upload failed with status {response.status_code}")
                
        except Exception as e:
            self.results["zip_file_upload"]["details"] = f"❌ Exception during ZIP file upload test: {str(e)}"
            self.log(f"❌ Exception during ZIP file upload test: {e}")
    
    def run_all_tests(self):
        """Run all proof upload tests"""
        self.log("=" * 70)
        self.log("PROOF UPLOAD FUNCTIONALITY TESTING")
        self.log("=" * 70)
        self.log(f"Testing against: {API_BASE}")
        self.log(f"Test Order ID: {TEST_ORDER_ID}")
        self.log(f"Test Stage: {TEST_STAGE}")
        self.log("")
        
        # Run tests in sequence
        self.test_admin_login()
        self.log("")
        
        self.test_proof_upload_basic()
        self.log("")
        
        self.test_file_size_limits()
        self.log("")
        
        self.test_api_response_format()
        self.log("")
        
        self.test_zip_file_upload()
        self.log("")
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test results summary"""
        self.log("=" * 70)
        self.log("PROOF UPLOAD TEST RESULTS SUMMARY")
        self.log("=" * 70)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for result in self.results.values() if result["passed"])
        
        for test_name, result in self.results.items():
            status = "✅ PASSED" if result["passed"] else "❌ FAILED"
            self.log(f"{test_name.upper().replace('_', ' ')}: {status}")
            self.log(f"  Details: {result['details']}")
            self.log("")
        
        self.log(f"OVERALL: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            self.log("🎉 ALL PROOF UPLOAD TESTS PASSED!")
        else:
            self.log("⚠️  SOME TESTS FAILED - Review details above")
        
        self.log("=" * 70)

def main():
    """Main test runner"""
    tester = ProofUploadTester()
    tester.run_all_tests()

if __name__ == "__main__":
    main()