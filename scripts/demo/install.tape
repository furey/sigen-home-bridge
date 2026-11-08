Output install-demo.webm

Set Shell "bash"
Set FontSize 20
Set Width 1280
Set Height 800
Set Padding 44
Set LineHeight 1.3
Set TypingSpeed 38ms
Set Framerate 25
Set CursorBlink false
Set Theme { "name": "sigen", "background": "#09090b", "foreground": "#fafafa", "cursor": "#f59e0b", "selection": "#27272a", "black": "#09090b", "red": "#f87171", "green": "#4ade80", "yellow": "#fbbf24", "blue": "#60a5fa", "magenta": "#e879f9", "cyan": "#67e8f9", "white": "#fafafa", "brightBlack": "#a1a1aa", "brightRed": "#fca5a5", "brightGreen": "#86efac", "brightYellow": "#fcd34d", "brightBlue": "#93c5fd", "brightMagenta": "#f0abfc", "brightCyan": "#a5f3fc", "brightWhite": "#ffffff" }

Hide
Type "export LANG=C.UTF-8 COLORTERM=truecolor PS1='\[\e[33m\]~\[\e[0m\] $ ' && cd /tmp && curl() { :; } && sh() { bash /vhs/scripts/demo/install-sim.sh; } && clear"
Enter
Sleep 500ms
Show

Sleep 800ms
Type "curl -fsSL https://raw.githubusercontent.com/furey/sigen-home-bridge/main/install.sh | sh"
Sleep 600ms
Enter
Wait+Screen@10s /Start now\?/
Sleep 1.4s
Type "Y"
Sleep 400ms
Enter
Wait+Screen@30s /update later/
Sleep 3.5s
