"""State reference table: FIPS, postal code, name, and 2020 apportionment seats.

Seat counts are the official 2020 Census apportionment (Public Law 94-171
release, April 2021), in effect for the 2022-2030 elections.
"""

STATES = [
    # fips, abbr, name, seats
    ("01", "AL", "Alabama", 7),
    ("02", "AK", "Alaska", 1),
    ("04", "AZ", "Arizona", 9),
    ("05", "AR", "Arkansas", 4),
    ("06", "CA", "California", 52),
    ("08", "CO", "Colorado", 8),
    ("09", "CT", "Connecticut", 5),
    ("10", "DE", "Delaware", 1),
    ("12", "FL", "Florida", 28),
    ("13", "GA", "Georgia", 14),
    ("15", "HI", "Hawaii", 2),
    ("16", "ID", "Idaho", 2),
    ("17", "IL", "Illinois", 17),
    ("18", "IN", "Indiana", 9),
    ("19", "IA", "Iowa", 4),
    ("20", "KS", "Kansas", 4),
    ("21", "KY", "Kentucky", 6),
    ("22", "LA", "Louisiana", 6),
    ("23", "ME", "Maine", 2),
    ("24", "MD", "Maryland", 8),
    ("25", "MA", "Massachusetts", 9),
    ("26", "MI", "Michigan", 13),
    ("27", "MN", "Minnesota", 8),
    ("28", "MS", "Mississippi", 4),
    ("29", "MO", "Missouri", 8),
    ("30", "MT", "Montana", 2),
    ("31", "NE", "Nebraska", 3),
    ("32", "NV", "Nevada", 4),
    ("33", "NH", "New Hampshire", 2),
    ("34", "NJ", "New Jersey", 12),
    ("35", "NM", "New Mexico", 3),
    ("36", "NY", "New York", 26),
    ("37", "NC", "North Carolina", 14),
    ("38", "ND", "North Dakota", 1),
    ("39", "OH", "Ohio", 15),
    ("40", "OK", "Oklahoma", 5),
    ("41", "OR", "Oregon", 6),
    ("42", "PA", "Pennsylvania", 17),
    ("44", "RI", "Rhode Island", 2),
    ("45", "SC", "South Carolina", 7),
    ("46", "SD", "South Dakota", 1),
    ("47", "TN", "Tennessee", 9),
    ("48", "TX", "Texas", 38),
    ("49", "UT", "Utah", 4),
    ("50", "VT", "Vermont", 1),
    ("51", "VA", "Virginia", 11),
    ("53", "WA", "Washington", 10),
    ("54", "WV", "West Virginia", 2),
    ("55", "WI", "Wisconsin", 8),
    ("56", "WY", "Wyoming", 1),
]

assert len(STATES) == 50
assert sum(s[3] for s in STATES) == 435

BY_FIPS = {s[0]: s for s in STATES}
BY_ABBR = {s[1]: s for s in STATES}
