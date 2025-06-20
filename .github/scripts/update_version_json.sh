#!/bin/bash  
# .github/scripts/update_version_json.sh  
  
set -e # Exit immediately if a command exits with a non-zero status.  
# set -x # Uncomment for extreme debug: prints every command executed  
  
# Check if version argument is provided  
if [ -z "$1" ]; then  
  echo "::error title=Missing Argument::New version number must be provided as the first argument to the script."  
  exit 1  
fi  
  
VERSION_INPUT="$1"  
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') # UTC ISO 8601 format  
# Paths are relative to the GITHUB_WORKSPACE (repository root)  
VERSION_FILE="public/version.json"  
VERSION_FILE_TMP="${VERSION_FILE}.tmp"  
# Place temporary jq filter file in a less conspicuous place or ensure it has a unique name if parallel runs were possible  
JQ_FILTER_FILE=".jq_filter_temp_$(date +%s%N)"  
  
  
echo "--- Script: update_version_json.sh ---"  
echo "Input Version: $VERSION_INPUT"  
echo "Build Date: $BUILD_DATE"  
echo "Target File: $VERSION_FILE"  
echo "--------------------------------------"  
  
echo "Using jq version: $(jq --version)"  
echo "Validating version input: '$VERSION_INPUT'"  
# Validate version format (SemVer-like)  
if ! [[ "$VERSION_INPUT" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$ ]]; then  
  echo "::error title=Invalid Version Format::Version '$VERSION_INPUT' does not look like SemVer (e.g., 1.2.3, 1.0.0-alpha)."  
  exit 1  
fi  
  
echo "Ensuring directory for '$VERSION_FILE' exists..."  
mkdir -p "$(dirname "$VERSION_FILE")"  
  
echo "Checking '$VERSION_FILE'..."  
# If file doesn't exist or is not valid JSON, initialize it.  
if [ ! -f "$VERSION_FILE" ] || ! jq -e . "$VERSION_FILE" > /dev/null 2>&1; then  
  echo "'$VERSION_FILE' is missing or not valid JSON. Initializing with a default structure."  
  echo '{ "version": "0.0.0", "buildDate": "0000-00-00T00:00:00Z" }' > "$VERSION_FILE"  
fi  
  
echo "Current content of '$VERSION_FILE' before update:"  
cat "$VERSION_FILE"  
  
echo "Updating '$VERSION_FILE' to version: $VERSION_INPUT, buildDate: $BUILD_DATE"  
  
# Write the jq filter program to a file.  
# Note: $new_version and $build_date are jq variables, not shell variables here.  
echo '.version = $new_version | .buildDate = $build_date' > "${JQ_FILTER_FILE}"  
  
echo "Contents of filter file ('${JQ_FILTER_FILE}'):"  
cat "${JQ_FILTER_FILE}"  
  
# Execute jq using the filter file.  
jq --arg new_version "$VERSION_INPUT" \  
   --arg build_date "$BUILD_DATE" \  
   --from-file "${JQ_FILTER_FILE}" \  
   "${VERSION_FILE}" > "${VERSION_FILE_TMP}"  
  
JQ_EXIT_CODE=$?  
# It's good practice to remove the filter file as soon as it's not needed.  
if [ -f "${JQ_FILTER_FILE}" ]; then  
  rm -f "${JQ_FILTER_FILE}"  
  echo "Cleaned up temporary filter file: ${JQ_FILTER_FILE}"  
fi  
  
  
if [ $JQ_EXIT_CODE -ne 0 ]; then  
  echo "::error title=jq command failed::jq processing of '$VERSION_FILE' failed with exit code $JQ_EXIT_CODE."  
  # If the temporary file exists and has content, it might be an error message from jq itself or partial output.  
  if [ -s "${VERSION_FILE_TMP}" ]; then  
      echo "Content of temporary output file after failed jq attempt:"  
      cat "${VERSION_FILE_TMP}"  
  fi  
  # Clean up the temporary output file on error.  
  if [ -f "${VERSION_FILE_TMP}" ]; then  
    rm -f "${VERSION_FILE_TMP}"  
    echo "Cleaned up temporary output file: ${VERSION_FILE_TMP}"  
  fi  
  exit 1 # Exit the script due to jq failure  
fi  
  
# If jq succeeded, move the temporary file to the final destination.  
mv "${VERSION_FILE_TMP}" "${VERSION_FILE}"  
  
echo "Successfully updated '$VERSION_FILE'. New content:"  
cat "$VERSION_FILE"  
echo "--- Script update_version_json.sh finished successfully. ---"  
