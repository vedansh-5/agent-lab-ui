#!/usr/bin/env python3  
"""  
Update version.json with new version and build date  
"""  
import os  
import sys  
import json  
import datetime  
import re  
  
def main():  
    # Check for version argument  
    if len(sys.argv) < 2:  
        print("::error title=Missing Argument::New version number must be provided as the first argument to the script.")  
        sys.exit(1)  
      
    version_input = sys.argv[1]  
    version_file = "public/version.json"  
      
    print("--- Script: update_version.py ---")  
    print(f"Input Version: {version_input}")  
      
    # Validate version format  
    semver_pattern = r'^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$'  
    if not re.match(semver_pattern, version_input):  
        print(f"::error title=Invalid Version Format::Version '{version_input}' does not look like SemVer (e.g., 1.2.3, 1.0.0-alpha).")  
        sys.exit(1)  
      
    # Get UTC datetime in ISO format  
    build_date = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")  
    print(f"Build Date: {build_date}")  
    print(f"Target File: {version_file}")  
    print("--------------------------------------")  
      
    # Ensure directory exists  
    os.makedirs(os.path.dirname(version_file), exist_ok=True)  
      
    # Initialize default structure if file doesn't exist  
    if not os.path.exists(version_file):  
        print(f"'{version_file}' not found. Initializing with default structure.")  
        data = {"version": "0.0.0", "buildDate": "0000-00-00T00:00:00Z"}  
    else:  
        # Read existing file  
        try:  
            with open(version_file, 'r') as f:  
                data = json.load(f)  
            print(f"Current content of '{version_file}' before update:")  
            print(json.dumps(data, indent=2))  
        except json.JSONDecodeError:  
            print(f"::error title=Invalid JSON::'{version_file}' contains invalid JSON. Reinitializing.")  
            data = {"version": "0.0.0", "buildDate": "0000-00-00T00:00:00Z"}  
      
    # Update values  
    data["version"] = version_input  
    data["buildDate"] = build_date  
      
    # Write updated file  
    try:  
        with open(version_file, 'w') as f:  
            json.dump(data, f, indent=2)  
            f.write('\n')  # Add trailing newline for POSIX compliance  
          
        print(f"Successfully updated '{version_file}'. New content:")  
        print(json.dumps(data, indent=2))  
        print("--- Script update_version.py finished successfully. ---")  
    except Exception as e:  
        print(f"::error title=File Write Error::Failed to write '{version_file}': {str(e)}")  
        sys.exit(1)  
  
if __name__ == "__main__":  
    main()  
