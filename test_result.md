#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Imported GitHub repo: remix-of-svp-booking-crate (SVP Booking Crate, Lovable-style React + Supabase edge-function proxy app).
  Bug reported: "svp api server update — exam_session system — test center name not showing on the booking page".
  User's SVP API now returns the new shape:
    "test_center": {
      "test_center_id": 70,
      "site_id": null,
      "test_center_city": "Mymensingh",
      "test_center_name": "Mymensingh Technical Training Centre",
      ...
    }
  User also asked that:
    - Within a selected city, ALL exam_sessions for that city must show (not other cities).
    - Within that city, MULTIPLE test_centers must show, each with real test_center_name + test_center_id.
    - Each exam_session shown must be a REAL session of the selected city/center (no leakage).
    - Edge-function / svp-proxy setup should stay as-is.

frontend:
  - task: "BookingPage city filter + test center display for new SVP API shape"
    implemented: true
    working: true
    file: "frontend/src/lib/booking-utils.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: false
          agent: "user"
          comment: "After SVP API update to new shape (test_center.test_center_city / test_center_name / test_center_id, site_id=null), test center name does not show on booking page and city filter returns nothing."
        - working: true
          agent: "main"
          comment: |
            Root cause: getSessionSiteCity() and getAvailableDateCity() in booking-utils.ts
            only read legacy fields (test_center.city, item.test_center_city). They missed
            the NEW SVP field test_center.test_center_city, so city resolution returned ""
            and cityFilteredSessions became empty.

            Fix (surgical, 2 functions):
              - getSessionSiteCity now also reads item.test_center.test_center_city.
              - getAvailableDateCity now also reads item.test_center.test_center_city.

            Other resolvers (getSessionSiteId, getExplicitSessionCenterName, extractTestCenterId)
            already supported the new field names, so no other changes were needed.

            Verification:
              - Added new regression test suite booking-new-svp-shape.test.ts (8 tests) covering:
                  * city resolution from test_center.test_center_city
                  * site_id resolution from test_center.test_center_id when site_id is null
                  * explicit center name from test_center.test_center_name
                  * multiple test centers within one city -> separate options
                  * multiple sessions within one test center -> collapsed under one option
                  * resolveSessionCenter preserves new fields + stamps resolved values
                  * city filter excludes other-city sessions
                  * available_dates city options use the new field
              - All 35 tests pass (8 new + 27 existing) -> no regressions.
              - tsc --noEmit clean.

            Also fixed a pre-existing supervisor/frontend gap:
              - package.json had no "start" script; supervisor was running `yarn start`.
              - Added "start": "vite --host 0.0.0.0 --port 3000".
              - Frontend supervisor is now RUNNING.

            svp-proxy / edge-function setup left untouched (per user instruction).

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "BookingPage city filter + test center display for new SVP API shape"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Surgical fix to booking-utils.ts (2 helper functions) to support the new SVP API
      `test_center.test_center_city / test_center_name / test_center_id` shape.
      Confirmed by 35 vitest tests (8 new regression tests + 27 pre-existing all passing).
      No changes to svp-proxy / Supabase edge functions / UI layout.
      Frontend supervisor was failing pre-existing because of missing `start` script in
      package.json — added it; service is now RUNNING.