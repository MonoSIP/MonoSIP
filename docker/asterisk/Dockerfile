FROM andrius/asterisk:22

USER root
RUN mkdir -p /var/lib/asterisk/munasip /etc/asterisk

COPY conf/ /etc/asterisk/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5060/udp 5060/tcp 8088 8089 5038 10000-10100/udp

ENTRYPOINT ["/entrypoint.sh"]
