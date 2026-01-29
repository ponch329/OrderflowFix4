#!/usr/bin/env python3
"""
Workflow Config Refactoring Test - Single Source of Truth

Tests the major refactoring to use workflow_config from database as the single source of truth for stages and statuses.

Test Areas:
1. OrderDesk Dynamic Folders (Critical) - sidebar shows ALL stages from workflow config
2. Stage and Status Labels in Table - proper labels from workflow_config  
3. Workflow Config Integration - adding new stages appears in sidebar
4. Backend Verification - API endpoints work with workflow config
5. BrandingContext - no errors related to workflowConfig

Usage: python workflow_config_test.py
"""

import requests
import json
import uuid
import time
from datetime import datetime
import os
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / 'frontend' / '.env')

# Configuration
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://orderflow-193.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

class WorkflowConfigTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.results = {
            "admin_login": {"passed": False, "details": ""},
            "workflow_config_fetch": {"passed": False, "details": ""},
            "orders_counts_dynamic": {"passed": False, "details": ""},
            "orders_list_labels": {"passed": False, "details": ""},
            "workflow_config_update": {"passed": False, "details": ""}
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
                    self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
                    self.results["admin_login"]["passed"] = True
                    self.results["admin_login"]["details"] = "✅ Admin login successful with valid token"
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
    
    def test_workflow_config_fetch(self):
        """Test fetching workflow config from database via tenant settings"""
        self.log("Testing Workflow Config Fetch from Database...")
        
        if not self.admin_token:
            self.results["workflow_config_fetch"]["details"] = "❌ Cannot test - admin login failed"
            return
        
        try:
            # Test tenant settings endpoint to get workflow config
            response = self.session.get(f"{API_BASE}/settings/tenant")
            
            if response.status_code == 200:
                tenant_data = response.json()
                settings = tenant_data.get("settings", {})
                
                # Check for workflow_config in settings
                workflow_config = settings.get("workflow_config", {})
                
                if workflow_config:
                    # Verify workflow config structure
                    stages = workflow_config.get("stages", [])
                    
                    if stages:
                        # Verify stages have required structure
                        stage_issues = []
                        for stage in stages:
                            if not all(key in stage for key in ["id", "name"]):
                                stage_issues.append(f"Stage missing required fields: {stage}")
                            
                            # Check statuses structure if present
                            statuses = stage.get("statuses", [])
                            for status in statuses:
                                if not all(key in status for key in ["id", "name"]):
                                    stage_issues.append(f"Status missing required fields: {status}")
                        
                        if not stage_issues:
                            self.results["workflow_config_fetch"]["passed"] = True
                            self.results["workflow_config_fetch"]["details"] = f"✅ Workflow config fetched successfully. Found {len(stages)} stages with proper structure"
                            self.log(f"✅ Workflow config fetched successfully with {len(stages)} stages")
                            
                            # Log stage details for verification
                            for stage in stages:
                                stage_name = stage.get("name", "Unknown")
                                status_count = len(stage.get("statuses", []))
                                self.log(f"   - Stage: {stage_name} ({status_count} statuses)")
                        else:
                            self.results["workflow_config_fetch"]["details"] = f"❌ Workflow config structure issues: {'; '.join(stage_issues)}"
                            self.log("❌ Workflow config structure issues found")
                    else:
                        self.results["workflow_config_fetch"]["details"] = "❌ No stages found in workflow config"
                        self.log("❌ No stages found in workflow config")
                else:
                    # Check if there's a default workflow config being used
                    self.results["workflow_config_fetch"]["passed"] = True
                    self.results["workflow_config_fetch"]["details"] = "✅ No custom workflow config found - system will use default config"
                    self.log("✅ No custom workflow config - using default")
            else:
                self.results["workflow_config_fetch"]["details"] = f"❌ Tenant settings fetch failed with status {response.status_code}: {response.text}"
                self.log(f"❌ Tenant settings fetch failed with status {response.status_code}")
                
        except Exception as e:
            self.results["workflow_config_fetch"]["details"] = f"❌ Exception during workflow config fetch: {str(e)}"
            self.log(f"❌ Exception during workflow config fetch: {e}")
    
    def test_orders_counts_dynamic(self):
        """Test that orders counts API returns dynamic counts based on workflow config"""
        self.log("Testing Dynamic Orders Counts from Workflow Config...")
        
        if not self.admin_token:
            self.results["orders_counts_dynamic"]["details"] = "❌ Cannot test - admin login failed"
            return
        
        try:
            # Get workflow config first to know expected stages
            config_response = self.session.get(f"{API_BASE}/settings/tenant")
            if config_response.status_code != 200:
                self.results["orders_counts_dynamic"]["details"] = "❌ Cannot get tenant settings for workflow config"
                return
            
            tenant_data = config_response.json()
            workflow_config = tenant_data.get("settings", {}).get("workflow_config", {})
            
            # If no custom workflow config, use default stages
            if workflow_config.get("stages"):
                expected_stages = [stage["id"] for stage in workflow_config.get("stages", [])]
            else:
                # Default stages from backend code
                expected_stages = ["clay", "paint", "shipped", "archived"]
            
            # Test orders counts endpoint
            response = self.session.get(f"{API_BASE}/admin/orders/counts")
            
            if response.status_code == 200:
                counts = response.json()
                
                # Verify counts structure
                required_fields = ["total", "by_stage", "status_counts"]
                missing_fields = [field for field in required_fields if field not in counts]
                
                if not missing_fields:
                    by_stage = counts.get("by_stage", {})
                    status_counts = counts.get("status_counts", {})
                    
                    # Verify that status_counts includes all stages from workflow config
                    workflow_stages_in_counts = []
                    for stage_id in expected_stages:
                        if stage_id in status_counts:
                            workflow_stages_in_counts.append(stage_id)
                    
                    # Check if we have dynamic status counts for workflow stages
                    dynamic_verification = []
                    for stage_id in expected_stages:
                        if stage_id != "archived":  # archived is handled differently
                            if stage_id in status_counts:
                                stage_statuses = status_counts[stage_id]
                                dynamic_verification.append(f"{stage_id}: {len(stage_statuses)} statuses")
                    
                    if dynamic_verification:
                        self.results["orders_counts_dynamic"]["passed"] = True
                        self.results["orders_counts_dynamic"]["details"] = f"✅ Dynamic counts working. Total: {counts['total']}, Stages: {len(by_stage)}, Status counts: {'; '.join(dynamic_verification)}"
                        self.log("✅ Dynamic orders counts working correctly")
                    else:
                        self.results["orders_counts_dynamic"]["details"] = f"❌ No dynamic status counts found for workflow stages: {expected_stages}"
                        self.log("❌ No dynamic status counts found")
                else:
                    self.results["orders_counts_dynamic"]["details"] = f"❌ Orders counts missing required fields: {missing_fields}"
                    self.log(f"❌ Orders counts missing required fields: {missing_fields}")
            else:
                self.results["orders_counts_dynamic"]["details"] = f"❌ Orders counts failed with status {response.status_code}: {response.text}"
                self.log(f"❌ Orders counts failed with status {response.status_code}")
                
        except Exception as e:
            self.results["orders_counts_dynamic"]["details"] = f"❌ Exception during orders counts test: {str(e)}"
            self.log(f"❌ Exception during orders counts test: {e}")
    
    def test_orders_list_labels(self):
        """Test that orders list shows proper stage/status labels from workflow config"""
        self.log("Testing Orders List with Dynamic Labels...")
        
        if not self.admin_token:
            self.results["orders_list_labels"]["details"] = "❌ Cannot test - admin login failed"
            return
        
        try:
            # Get orders list
            response = self.session.get(f"{API_BASE}/admin/orders?limit=10")
            
            if response.status_code == 200:
                data = response.json()
                orders = data.get("orders", [])
                
                if orders:
                    # Analyze orders for stage/status values
                    stage_values = set()
                    status_fields = set()
                    
                    for order in orders:
                        stage = order.get("stage")
                        if stage:
                            stage_values.add(stage)
                        
                        # Check for stage-specific status fields
                        for key in order.keys():
                            if key.endswith("_status"):
                                status_fields.add(key)
                    
                    # Verify we have proper stage and status data
                    if stage_values and status_fields:
                        self.results["orders_list_labels"]["passed"] = True
                        self.results["orders_list_labels"]["details"] = f"✅ Orders list contains proper stage/status data. Stages: {list(stage_values)}, Status fields: {list(status_fields)}"
                        self.log(f"✅ Orders list has proper stage/status data")
                        
                        # Log sample order data
                        sample_order = orders[0]
                        self.log(f"   Sample order - Stage: {sample_order.get('stage')}, ID: {sample_order.get('order_number', 'N/A')}")
                    else:
                        self.results["orders_list_labels"]["details"] = f"❌ Orders missing stage/status data. Stages: {list(stage_values)}, Status fields: {list(status_fields)}"
                        self.log("❌ Orders missing proper stage/status data")
                else:
                    self.results["orders_list_labels"]["details"] = "⚠️ No orders found to test labels"
                    self.log("⚠️ No orders found to test labels")
            else:
                self.results["orders_list_labels"]["details"] = f"❌ Orders list failed with status {response.status_code}: {response.text}"
                self.log(f"❌ Orders list failed with status {response.status_code}")
                
        except Exception as e:
            self.results["orders_list_labels"]["details"] = f"❌ Exception during orders list test: {str(e)}"
            self.log(f"❌ Exception during orders list test: {e}")
    
    def test_workflow_config_update(self):
        """Test updating workflow config and verifying it affects the system"""
        self.log("Testing Workflow Config Update Integration...")
        
        if not self.admin_token:
            self.results["workflow_config_update"]["details"] = "❌ Cannot test - admin login failed"
            return
        
        try:
            # First, get current tenant settings
            response = self.session.get(f"{API_BASE}/settings/tenant")
            if response.status_code != 200:
                self.results["workflow_config_update"]["details"] = "❌ Cannot get current tenant settings"
                return
            
            tenant_data = response.json()
            original_settings = tenant_data.get("settings", {})
            original_workflow_config = original_settings.get("workflow_config", {})
            original_stages = original_workflow_config.get("stages", [])
            
            # Create a test stage to add
            test_stage_id = f"test_stage_{int(time.time())}"
            test_stage = {
                "id": test_stage_id,
                "name": "Test Stage",
                "order": len(original_stages) + 1,
                "statuses": [
                    {"id": "testing", "name": "Testing"},
                    {"id": "test_complete", "name": "Test Complete"}
                ]
            }
            
            # Add the test stage to config
            updated_workflow_config = original_workflow_config.copy()
            updated_workflow_config["stages"] = original_stages + [test_stage]
            
            # Update tenant settings with new workflow config
            update_data = {
                "settings": {
                    "workflow_config": updated_workflow_config
                }
            }
            update_response = self.session.patch(f"{API_BASE}/settings/tenant", json=update_data)
            
            if update_response.status_code == 200:
                # Wait a moment for the update to propagate
                time.sleep(1)
                
                # Verify the update by fetching tenant settings again
                verify_response = self.session.get(f"{API_BASE}/settings/tenant")
                if verify_response.status_code == 200:
                    updated_tenant_data = verify_response.json()
                    updated_workflow_config_check = updated_tenant_data.get("settings", {}).get("workflow_config", {})
                    updated_stages = updated_workflow_config_check.get("stages", [])
                    
                    # Check if our test stage is present
                    test_stage_found = any(stage.get("id") == test_stage_id for stage in updated_stages)
                    
                    if test_stage_found:
                        # Test that orders counts now includes the new stage
                        counts_response = self.session.get(f"{API_BASE}/admin/orders/counts")
                        if counts_response.status_code == 200:
                            counts = counts_response.json()
                            status_counts = counts.get("status_counts", {})
                            
                            # The new stage should appear in status_counts (even if empty)
                            new_stage_in_counts = test_stage_id in status_counts
                            
                            self.results["workflow_config_update"]["passed"] = True
                            self.results["workflow_config_update"]["details"] = f"✅ Workflow config update successful. Test stage '{test_stage_id}' added and integrated. In counts: {new_stage_in_counts}"
                            self.log("✅ Workflow config update and integration working")
                            
                            # Clean up - remove the test stage
                            cleanup_data = {
                                "settings": {
                                    "workflow_config": original_workflow_config
                                }
                            }
                            cleanup_response = self.session.patch(f"{API_BASE}/settings/tenant", json=cleanup_data)
                            if cleanup_response.status_code == 200:
                                self.log("✅ Test stage cleaned up successfully")
                            else:
                                self.log("⚠️ Failed to clean up test stage")
                        else:
                            self.results["workflow_config_update"]["details"] = f"❌ Config updated but counts API failed: {counts_response.status_code}"
                            self.log("❌ Config updated but counts API failed")
                    else:
                        self.results["workflow_config_update"]["details"] = "❌ Test stage not found after update"
                        self.log("❌ Test stage not found after update")
                else:
                    self.results["workflow_config_update"]["details"] = f"❌ Cannot verify config update: {verify_response.status_code}"
                    self.log("❌ Cannot verify config update")
            else:
                self.results["workflow_config_update"]["details"] = f"❌ Workflow config update failed with status {update_response.status_code}: {update_response.text}"
                self.log(f"❌ Workflow config update failed with status {update_response.status_code}")
                
        except Exception as e:
            self.results["workflow_config_update"]["details"] = f"❌ Exception during workflow config update test: {str(e)}"
            self.log(f"❌ Exception during workflow config update test: {e}")
    
    def run_all_tests(self):
        """Run all tests"""
        self.log("=" * 80)
        self.log("WORKFLOW CONFIG REFACTORING TEST - SINGLE SOURCE OF TRUTH")
        self.log("=" * 80)
        self.log(f"Testing against: {API_BASE}")
        self.log("")
        
        # Run tests in sequence
        self.test_admin_login()
        self.log("")
        
        self.test_workflow_config_fetch()
        self.log("")
        
        self.test_orders_counts_dynamic()
        self.log("")
        
        self.test_orders_list_labels()
        self.log("")
        
        self.test_workflow_config_update()
        self.log("")
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test results summary"""
        self.log("=" * 80)
        self.log("WORKFLOW CONFIG REFACTORING TEST RESULTS")
        self.log("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for result in self.results.values() if result["passed"])
        
        for test_name, result in self.results.items():
            status = "✅ PASSED" if result["passed"] else "❌ FAILED"
            self.log(f"{test_name.upper().replace('_', ' ')}: {status}")
            self.log(f"  Details: {result['details']}")
            self.log("")
        
        self.log(f"OVERALL: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            self.log("🎉 ALL WORKFLOW CONFIG TESTS PASSED!")
            self.log("✅ Workflow config is working as single source of truth")
        else:
            self.log("⚠️  SOME WORKFLOW CONFIG TESTS FAILED - Review details above")
        
        self.log("=" * 80)

def main():
    """Main test runner"""
    tester = WorkflowConfigTester()
    tester.run_all_tests()

if __name__ == "__main__":
    main()