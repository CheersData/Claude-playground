# Controlla.me Daemon — systemd setup

## Installazione

```bash
# Copia il file di servizio
sudo cp systemd/controlla-daemon.service /etc/systemd/system/

# Ricarica la configurazione systemd
sudo systemctl daemon-reload

# Abilita il servizio (auto-start al boot)
sudo systemctl enable controlla-daemon

# Avvia il servizio
sudo systemctl start controlla-daemon
```

Oppure usa lo script di controllo rapido:

```bash
./scripts/daemon-ctl.sh install
```

## Comandi utili

```bash
# Stato del servizio
sudo systemctl status controlla-daemon

# Avvia / ferma / riavvia
sudo systemctl start controlla-daemon
sudo systemctl stop controlla-daemon
sudo systemctl restart controlla-daemon

# Log (ultimi 50)
journalctl -u controlla-daemon -n 50 --no-pager

# Log in tempo reale
journalctl -u controlla-daemon -f

# Log di oggi
journalctl -u controlla-daemon --since today

# Disabilita auto-start al boot
sudo systemctl disable controlla-daemon
```

## Cosa fa il daemon

Lancia `npx tsx scripts/cme-autorun.ts --watch` che:

1. Scansiona i dipartimenti ogni 15 minuti (configurabile via `cme-daemon-state.json`)
2. Produce un report strutturato in `company/daemon-report.json`
3. Scrive un ping in `company/daemon-ping.txt` se ci sono signal azionabili
4. Se il board e quasi vuoto, avvia una plenaria automatica per generare nuovi task

Il daemon si riavvia automaticamente in caso di crash (max 5 tentativi in 5 minuti).

## Configurazione runtime

Il daemon legge `company/cme-daemon-state.json` ad ogni ciclo. Per modificare il comportamento senza riavviare:

```json
{
  "enabled": true,
  "intervalMinutes": 15
}
```

- `enabled: false` — il daemon salta il ciclo (resta in watch ma non fa nulla)
- `intervalMinutes` — intervallo tra cicli in minuti

## Aggiornamento

Dopo un `git pull` che modifica il daemon:

```bash
sudo systemctl restart controlla-daemon
```

Se il file `.service` e cambiato:

```bash
sudo cp systemd/controlla-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart controlla-daemon
```
