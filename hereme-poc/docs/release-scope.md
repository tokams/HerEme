# Release scope and external gates

P0 is the first public site: preserved poster wall, recoverable pseudonyms,
secure sessions/capabilities, paginated forum APIs, safe image lifecycle, private
moderation, policies/rate limits, Linux/Caddy deployment, backups and cutover.

P1 is up-to-180-second video with streamed upload, durable processing states,
ffprobe validation, H.264/AAC MP4 derivative, thumbnail, detail-only playback and
unchanged category/vote/comment/report behavior. It does not block v1.

Later scope is Norway map/location filtering, optional BankID verification and
remote moderator sign-in. ADR 0007 defines boundaries only; flags remain off.

External launch evidence cannot be produced in this repository: owned domain and
DNS, actual VM/firewall/SSH posture, CA certificate renewal, phone cellular smoke,
off-host backup destination, real-device camera/video checks, approved Norway
geometry license, BankID provider contract and owner sign-off. The go/no-go
checklist must leave these red until real evidence is attached.
