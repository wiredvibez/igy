#!/bin/sh
# Regenerates the original 42-slide deck as ../opening-activity-deck-generated.pptx.
# The deck in use was then edited by hand and finished with the pride/logo pass:
#   node pride-assets.js <assetsDir>
#   python3 add-pride.py ../opening-activity-deck.pptx <assetsDir> ../opening-activity-deck-final.pptx
# Never write over ../opening-activity-deck.pptx: it holds the hand edits.
# Needs: node with pptxgenjs sharp react-icons react react-dom (set NODE_PATH to their node_modules), python3.
set -e
cd "$(dirname "$0")"
WORK="${WORK:-$(mktemp -d)}"
node build-deck.js "$WORK"
python3 animate.py "$WORK/deck.pptx" "$WORK/transitions.json" ../opening-activity-deck-generated.pptx
