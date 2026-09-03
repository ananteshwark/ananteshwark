"""Build stamp populated at release time.

`git archive` substitutes the placeholders below via the `export-subst`
attribute (see the repository .gitattributes), so every offline tarball carries
the exact commit it was built from. In a normal working checkout the literal
``$Format:...$`` strings remain, which the version service treats as "unknown"
(no build increment happens from a plain checkout).
"""
BUILD_COMMIT = "$Format:%H$"
BUILD_DATE = "$Format:%cI$"
